---
title: Subprocessor and Vendor List
description: Lists subprocessors, vendors, service providers, infrastructure providers, AI providers, payment processors, analytics providers, and other third parties used or planned for Helix AI.
effective_date: 2026-05-18
last_updated: 2026-05-18
owner: SinLess Games LLC
status: draft
---

# Subprocessor and Vendor List

## 1. Purpose

This Subprocessor and Vendor List identifies third parties that SinLess Games LLC may use to provide, secure, operate, support, monitor, bill, analyze, improve, and maintain Helix AI.

Helix AI is operated by SinLess Games LLC.

This list is intended to provide transparency about vendors that may process, store, transmit, access, or support data related to Helix AI.

This document should be read together with:

- [Privacy Policy](./privacy.md)
- [Data Policy](./data.md)
- [Security Policy](./security.md)
- [Cookie and Tracking Policy](./cookie-tracking.md)
- [AI Transparency Policy](./ai-transparency.md)
- [Responsible AI Policy](./responsible-ai.md)
- [Incident Notification Policy](./incident-notification.md)
- [Payment Processor Compliance Policy](./payment-proccessor-compliance.md)
- [Terms of Use](./terms-of-use.md)

## 2. Core Commitments

SinLess Games LLC makes the following commitments for Helix AI:

1. **Users own their data.**
2. **Helix AI does not sell user data.**
3. **Helix AI does not use user data outside legitimate service business logic and approved research purposes.**
4. **Vendors and subprocessors should only process data for authorized Helix AI purposes.**
5. **Subprocessors should be reviewed before use where practical.**
6. **Sensitive data should receive stronger protection.**
7. **Enterprise customers should receive appropriate notice of material subprocessor changes where required by contract.**
8. **Self-hosted and air-gapped deployments may use different vendors or no external vendors depending on customer configuration.**

## 3. Scope

This list applies to Helix AI services, including:

- Websites
- Web applications
- Desktop applications
- Mobile applications
- Browser extensions
- APIs
- Developer tools
- Documentation sites
- Marketplace features
- Plugins
- Automations
- Integrations
- Dashboards
- Analytics features
- AI memory features
- Support systems
- Billing systems
- Cloud-hosted deployments
- Hybrid deployments, where applicable
- Self-hosted deployments, where applicable
- Air-gapped deployments, where applicable

Some vendors may apply only to specific plans, regions, features, integrations, deployment types, or customer configurations.

## 4. Definitions

## 4.1 Subprocessor

A **subprocessor** is a third party that may process personal data, Customer Data, Account Data, Service Data, or other protected data on behalf of SinLess Games LLC to provide Helix AI.

Examples may include hosting providers, database providers, AI model providers, payment processors, support tools, observability tools, email providers, and analytics providers.

## 4.2 Vendor

A **vendor** is a third party that provides products or services to SinLess Games LLC.

Some vendors are subprocessors. Others may not process user data directly.

## 4.3 Service Provider

A **service provider** is a third party that performs a business function for SinLess Games LLC or Helix AI.

## 4.4 Customer-Controlled Vendor

A **customer-controlled vendor** is a vendor selected, configured, connected, or operated by the user or organization.

Examples include customer GitHub accounts, customer Google Drive accounts, customer Discord servers, customer cloud providers, customer identity providers, customer observability stacks, and customer self-hosted infrastructure.

## 5. Vendor Categories

Helix AI vendors may fall into the following categories:

- Hosting and edge infrastructure
- DNS and network security
- Database and storage
- Authentication and identity
- AI model providers
- AI infrastructure providers
- Email and communications
- Billing and payments
- Tax and accounting
- Analytics and telemetry
- Observability and monitoring
- Error reporting
- Feature flags and experimentation
- Customer support
- Documentation and CMS
- Marketplace operations
- Security and abuse prevention
- Developer tools
- Source control and CI/CD
- File storage and connected integrations
- Legal, compliance, and business operations

## 6. Current and Planned Vendor List

The table below includes current, planned, or expected vendors for Helix AI based on the intended architecture.

Before publishing this document, confirm each vendor’s actual use, data access, region, contract status, and whether the vendor is active, planned, optional, or deprecated.

| Vendor | Category | Purpose | Data Processed | Role | Status |
|---|---|---|---|---|---|
| **Vercel** | Hosting / frontend deployment | Hosts Next.js frontend, edge functions, deployments, previews, and web application infrastructure. | Account metadata, request metadata, IP addresses, logs, frontend app data, limited Customer Data depending on request flow. | Subprocessor | Planned / Confirm |
| **Cloudflare** | DNS / edge / security / CDN | DNS, CDN, DDoS protection, WAF, edge routing, Workers, tunnels, caching, TLS, security controls. | IP addresses, request metadata, headers, logs, cached assets, security events, limited Customer Data depending on routing. | Subprocessor | Planned / Confirm |
| **Supabase** | Database / authentication / storage | Postgres database, pgvector, authentication support, object storage where configured. | Account Data, Customer Data, Service Data, memory, embeddings, files, workspace data, organization data. | Subprocessor | Planned / Confirm |
| **Redis provider / managed Redis** | Cache / queues / sessions | Caching, rate limits, queues, session support, short-term memory, automation state. | Session data, cache data, queue payloads, metadata, temporary Customer Data depending on feature. | Subprocessor | Planned / Confirm Provider |
| **OpenAI** | AI model provider | AI inference, model responses, embeddings, analysis, generation, reasoning, and AI-powered features where enabled. | Prompts, responses, context, retrieved content, metadata, files or file excerpts where used. | Subprocessor | Planned / Confirm |
| **Other AI providers** | AI model provider | Optional model routing, fallback inference, specialized model use, local/cloud model choices. | Prompts, responses, context, retrieved content, metadata, files or file excerpts where used. | Subprocessor | Optional / TBD |
| **Stripe** | Payments / billing | Subscription billing, checkout, invoices, payment method handling, fraud prevention, taxes, usage billing, marketplace payments where enabled. | Billing Data, payment metadata, transaction records, invoice data, tax data, fraud signals, customer identifiers. | Subprocessor | Planned / Confirm |
| **PayPal** | Payments / billing | Payment processing, subscriptions, checkout, customer payments, refunds where enabled. | Billing Data, payment metadata, transaction records, customer identifiers, dispute records. | Subprocessor | Planned / Confirm |
| **Hypertune** | Feature flags / experimentation | Feature flags, entitlements, plan gating, controlled rollout, experimentation. | User IDs, tenant IDs, feature flag metadata, entitlement data, plan data, usage context. | Subprocessor | Planned / Confirm |
| **Google Analytics** | Analytics / marketing | Website analytics, documentation usage, public marketing page measurement, conversion analytics where enabled. | Cookie identifiers, device metadata, page views, approximate location, referral data, usage events. | Subprocessor | Planned / Confirm |
| **Grafana Cloud** | Observability / monitoring | Metrics, dashboards, logs, traces, profiles, frontend telemetry, service monitoring. | Logs, metrics, traces, errors, metadata, service health data, limited request data depending on configuration. | Subprocessor | Planned / Confirm |
| **Grafana Faro** | Frontend observability | Browser telemetry, frontend errors, performance monitoring, user experience monitoring. | Browser metadata, errors, page metadata, performance data, limited user/session identifiers. | Subprocessor | Planned / Confirm |
| **Contentful** | CMS / content management | Marketing content, documentation content, public site content, content workflows. | Content metadata, editor account data, public content, limited user interaction metadata where configured. | Subprocessor | Planned / Confirm |
| **GitHub** | Source control / CI/CD / developer workflows | Source control, issue tracking, pull requests, GitHub Actions, self-hosted runner coordination, release workflows. | Repository data, developer account data, CI/CD metadata, issue/PR data, workflow logs. | Vendor / Subprocessor depending on use | Planned / Confirm |
| **Google Workspace / Gmail / Calendar / Drive APIs** | User-authorized integrations | User-authorized email, calendar, contacts, Drive, Docs, Sheets, and Slides integrations. | Data authorized by user or organization, including emails, files, calendar data, contacts, metadata. | Customer-Controlled Integration / Subprocessor depending on feature | Optional |
| **Discord** | User-authorized integration / community | Community spaces, notifications, bots, ChatOps, automations, support/community operations where enabled. | Discord IDs, messages, server metadata, channel metadata, bot interaction data. | Customer-Controlled Integration / Vendor | Optional / Planned |
| **Twitch** | User-authorized integration | Creator and streamer integrations, automation triggers, chat or stream-related workflows where enabled. | Twitch account IDs, stream metadata, chat metadata, automation data. | Customer-Controlled Integration / Vendor | Optional / Planned |
| **Cloudflare R2** | Object storage | Storage for backups, files, logs, analytics exports, observability archives, or customer assets where configured. | Files, backups, logs, object metadata, Customer Data depending on storage use. | Subprocessor | Optional / Planned |
| **Email service provider** | Email delivery | Transactional email, account notices, billing notices, incident notices, security notices, support communications. | Email address, name, message metadata, email content, delivery events. | Subprocessor | TBD |
| **Customer support provider** | Support / helpdesk | Support tickets, customer communications, troubleshooting, support history. | Contact details, support messages, screenshots, logs provided by user, account metadata. | Subprocessor | TBD |
| **Status page provider** | Incident communication | Public or customer status page, incident updates, maintenance notices, subscriber alerts. | Subscriber email, incident communication data, service status data. | Subprocessor | TBD |
| **Tax calculation provider** | Tax / billing | Sales tax, VAT, GST, digital tax calculation, tax reporting, tax exemption handling. | Billing address, tax IDs, invoice records, transaction metadata. | Subprocessor | TBD |
| **Accounting provider** | Accounting / finance | Bookkeeping, revenue tracking, invoices, financial reporting, tax preparation support. | Billing records, customer billing metadata, invoice records, payment records. | Vendor / Subprocessor depending on use | TBD |
| **Legal and compliance providers** | Legal / compliance | Legal review, compliance support, data processing agreements, privacy requests, contract management. | Contract data, legal notices, customer contact data, incident records where needed. | Vendor / Subprocessor depending on use | TBD |
| **Security scanning providers** | Security / vulnerability management | Dependency scanning, code scanning, container scanning, secret scanning, vulnerability review. | Source code, dependency metadata, security findings, CI/CD metadata. | Vendor / Subprocessor depending on use | TBD |
| **Error monitoring provider** | Error reporting | Application error tracking, exceptions, performance diagnostics. | Error logs, stack traces, request metadata, device metadata, limited user identifiers. | Subprocessor | TBD |
| **Object storage provider** | File storage / backups | File uploads, generated artifacts, exports, backups, marketplace assets, support attachments. | Files, exports, backups, metadata, Customer Data depending on use. | Subprocessor | TBD |
| **Identity provider integrations** | Authentication / SSO | OAuth, SAML, OIDC, SSO, enterprise identity, directory sync where enabled. | Login identifiers, email addresses, names, group membership, role metadata. | Customer-Controlled Integration / Subprocessor depending on configuration | Optional |
| **Customer cloud providers** | Self-hosted / hybrid / air-gapped | Customer-operated infrastructure for private deployments. | Data controlled by customer deployment. | Customer-Controlled Vendor | Optional |
| **Customer observability systems** | Self-hosted / enterprise monitoring | Customer-managed logs, metrics, traces, dashboards, SIEM, alerting. | Logs, metrics, traces, audit records, service telemetry. | Customer-Controlled Vendor | Optional |
| **Customer secret managers** | Secrets / key management | Vault, KMS, cloud secret managers, customer-managed encryption, secret references. | Secrets, keys, tokens, credentials, secret metadata. | Customer-Controlled Vendor | Optional |

## 7. Active Subprocessors

Before publication, move confirmed active subprocessors into this section.

| Subprocessor | Service Provided | Data Processed | Location / Region | Security Documentation | Status |
|---|---|---|---|---|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |

## 8. Planned Subprocessors

The following vendors are expected or planned but must be confirmed before production launch.

| Vendor | Expected Use | Data Risk Level | Required Review |
|---|---|---|---|
| Vercel | Frontend hosting and deployment | Medium | Security, privacy, DPA |
| Cloudflare | DNS, CDN, edge security, Workers | Medium | Security, privacy, DPA |
| Supabase | Postgres, pgvector, auth, storage | High | Security, privacy, DPA, data residency |
| Redis provider | Cache, queues, sessions | Medium / High depending on data | Security, privacy, DPA |
| OpenAI | AI model processing | High | Security, privacy, DPA, model data-use review |
| Stripe | Billing and payments | High | Payment, privacy, DPA, processor terms |
| PayPal | Billing and payments | High | Payment, privacy, processor terms |
| Hypertune | Feature flags and entitlements | Medium | Security, privacy, DPA |
| Google Analytics | Analytics | Medium | Cookie, privacy, consent review |
| Grafana Cloud | Observability | Medium / High depending on log content | Security, privacy, DPA |
| Contentful | CMS | Low / Medium | Security, privacy, DPA |

## 9. Optional and Customer-Controlled Integrations

Users and organizations may connect Helix AI to third-party services.

These integrations may process user-authorized data based on granted permissions.

Examples include:

- Google Drive
- Gmail
- Google Calendar
- Google Contacts
- GitHub
- Discord
- Twitch
- Slack
- Microsoft 365
- Notion
- Jira
- Linear
- Trello
- Asana
- Cloudflare
- Vercel
- Supabase
- AWS
- Azure
- Google Cloud
- Kubernetes clusters
- Proxmox environments
- Grafana
- Prometheus
- Loki
- Tempo
- Vault
- Other customer-selected systems

Customer-controlled integrations are enabled by the user or organization.

Users and organizations are responsible for:

- Reviewing permissions
- Granting only necessary access
- Disconnecting unused integrations
- Securing third-party accounts
- Reviewing third-party terms
- Reviewing third-party privacy policies
- Managing data flow into and out of Helix AI
- Ensuring lawful use of connected systems

## 10. Self-Hosted, Hybrid, and Air-Gapped Deployments

Self-hosted, hybrid, private, and air-gapped deployments may use a different vendor model.

In these deployments, the customer may control:

- Hosting
- Database
- Cache
- Object storage
- Search
- Vector database
- AI models
- Authentication
- Secrets
- Logs
- Metrics
- Traces
- Backups
- Marketplace access
- Plugin review
- Integrations
- Email
- Billing connection, if applicable

Air-gapped deployments should be designed to operate without public SaaS dependencies where practical.

SinLess Games LLC may still process limited data related to:

- Licensing
- Support
- Updates
- Security advisories
- Marketplace access
- Billing
- Contract management
- Optional telemetry, if enabled
- Professional services, if purchased

## 11. Data Categories Processed by Vendors

Depending on the vendor and feature, subprocessors may process one or more of the following data categories:

- Account Data
- Customer Data
- Personal information
- Organization data
- Workspace data
- User prompts
- AI responses
- Uploaded files
- Connected integration data
- Memory data
- Embeddings
- Search indexes
- Analytics data
- Usage metadata
- Billing data
- Payment metadata
- Support data
- Error logs
- Security logs
- Audit logs
- Device metadata
- IP addresses
- Cookie identifiers
- Authentication metadata
- API metadata
- Marketplace data
- Developer data
- Automation data
- Tool execution data
- Plugin execution data
- Incident records
- Legal request records

Not every vendor processes every data category.

## 12. Vendor Review

SinLess Games LLC should review vendors and subprocessors before production use where practical.

Vendor review may include:

- Security review
- Privacy review
- Data processing agreement review
- Subprocessor terms review
- Data residency review
- Incident notification review
- Access control review
- Encryption review
- Retention review
- Compliance documentation review
- Payment processor rules review
- AI data-use review
- Marketplace risk review
- Business continuity review

Higher-risk vendors should receive stronger review.

## 13. Vendor Security Expectations

SinLess Games LLC should use vendors that provide reasonable security safeguards appropriate to the data processed.

Vendor safeguards may include:

- Encryption in transit
- Encryption at rest
- Access controls
- Audit logs
- Vulnerability management
- Incident response
- Data retention controls
- Backup controls
- Personnel access restrictions
- Subprocessor controls
- Security documentation
- Compliance documentation
- Business continuity controls

## 14. Vendor Privacy Expectations

Vendors and subprocessors should process data only for authorized purposes.

Privacy expectations may include:

- Processing only on documented instructions
- No sale of user data
- No unrelated use of Customer Data
- Appropriate confidentiality commitments
- Appropriate deletion or return of data
- Appropriate support for privacy requests
- Appropriate subprocessor disclosure
- Appropriate international transfer mechanisms
- Appropriate incident notification obligations

## 15. AI Provider Expectations

AI providers may process prompts, responses, files, retrieved context, memory snippets, metadata, or tool results when needed to provide AI features.

AI provider expectations may include:

- Clear data-use terms
- No training on private Customer Data unless enabled, disclosed, or contractually permitted
- Appropriate retention controls
- Appropriate security controls
- Appropriate privacy controls
- Enterprise opt-out support where available
- Support for sensitive-data restrictions where applicable
- Clear incident notification obligations
- Compatibility with organization model-routing rules

AI provider use is also governed by the [AI Transparency Policy](./ai-transparency.md), [Responsible AI Policy](./responsible-ai.md), [Privacy Policy](./privacy.md), and [Data Policy](./data.md).

## 16. Payment Processor Expectations

Payment processors may process billing, payment, invoice, tax, dispute, refund, and fraud-prevention data.

Payment processor expectations may include:

- Secure checkout
- Payment tokenization
- Fraud prevention
- Chargeback handling
- Tax support
- Subscription management
- Compliance with processor rules
- Compliance with card network rules
- Appropriate privacy and security terms
- Appropriate incident notification
- Appropriate data retention controls

Payment processor use is also governed by the [Billing, Refund, and Cancellation Policy](./billing-refund-cancellation.md) and [Payment Processor Compliance Policy](./payment-proccessor-compliance.md).

## 17. Analytics and Tracking Vendors

Analytics and tracking vendors may process usage metadata, device metadata, page views, events, referral data, approximate location, cookie identifiers, and other analytics data.

Analytics and tracking use should follow the [Cookie and Tracking Policy](./cookie-tracking.md).

Where required, optional analytics and advertising cookies should only be used after consent.

Helix AI should not use private user prompts, files, memory, organization data, or workspace data for third-party targeted advertising.

## 18. Observability Vendors

Observability vendors may process logs, metrics, traces, profiles, error events, and service telemetry.

SinLess Games LLC should configure observability systems to avoid unnecessary sensitive data collection where practical.

Observability data should avoid:

- Passwords
- API keys
- Private keys
- Access tokens
- Full payment card numbers
- Sensitive personal data unless necessary and protected
- Private Customer Data unless required for debugging, support, or incident response

## 19. Support Vendors

Support vendors may process support tickets, user messages, screenshots, logs, troubleshooting notes, account metadata, and support history.

Users should not send secrets, private keys, passwords, full payment card numbers, or unnecessary sensitive data through support channels.

Support access to Customer Data should be limited to what is reasonably needed to resolve the issue.

## 20. Marketplace and Plugin Vendors

Marketplace publishers may process data if users or organizations install their marketplace items.

Marketplace items may include:

- Plugins
- Connectors
- Workflows
- Dashboards
- Templates
- Personalities
- Prompt packs
- Automation packages
- Developer tools

Marketplace publishers must disclose:

- Data accessed
- Permissions requested
- Network access
- Storage behavior
- AI provider use
- Third-party services
- Telemetry behavior
- Retention behavior
- Support contact
- Publisher identity

Marketplace publishers may not sell user data, exfiltrate user data, hide tracking, request excessive permissions, or use data outside approved marketplace functionality.

## 21. Subprocessor Changes

SinLess Games LLC may add, remove, or replace subprocessors as Helix AI evolves.

Subprocessor changes may occur due to:

- New features
- Improved security
- Improved reliability
- Cost optimization
- Product changes
- Vendor availability
- Vendor risk
- Legal requirements
- Compliance requirements
- Enterprise requirements
- Regional requirements
- Service deprecation
- Incident response

When required by law or contract, SinLess Games LLC will provide notice of material subprocessor changes.

## 22. Enterprise Subprocessor Notices

Enterprise customers may receive additional subprocessor notice rights under a written agreement.

Enterprise agreements may include:

- Advance notice of new subprocessors
- Objection periods
- Data processing agreements
- Regional restrictions
- Data residency commitments
- Subprocessor audit information
- Security documentation
- Custom vendor restrictions
- AI provider restrictions
- Self-hosted deployment terms
- Air-gapped deployment terms

If an enterprise agreement conflicts with this list, the signed enterprise agreement controls only for that enterprise customer and only to the extent of the conflict.

## 23. Objections to Subprocessors

Where required by contract, enterprise customers may object to a new subprocessor.

Objections should be sent to:

`privacy@sinlessgames.com`

The objection should include:

- Customer name
- Organization name
- Contact information
- Subprocessor at issue
- Reason for objection
- Data protection concern
- Security concern
- Legal or contractual basis for objection

SinLess Games LLC will review valid objections according to the applicable agreement.

## 24. International Data Transfers

Some vendors and subprocessors may process data outside the user’s country, state, province, or region.

International transfer mechanisms may include:

- Data processing agreements
- Standard contractual clauses
- Transfer impact assessments
- Regional hosting choices
- Customer-managed deployment
- Self-hosting
- Air-gapped deployment
- Other legally approved transfer mechanisms

Enterprise customers may have additional data residency or transfer terms in written agreements.

## 25. Vendor Incident Notification

If a vendor or subprocessor incident materially affects Helix AI users, SinLess Games LLC will evaluate the incident and provide notification where required by law, contract, or policy.

Vendor incident handling may include:

- Reviewing vendor incident reports
- Assessing affected data
- Assessing affected customers
- Coordinating mitigation
- Notifying affected users or organizations where required
- Updating the status page where appropriate
- Updating policies or vendors where needed

Incident handling is described further in the [Incident Notification Policy](./incident-notification.md).

## 26. Vendor Removal

SinLess Games LLC may remove, replace, suspend, or restrict a vendor when appropriate.

Reasons may include:

- Security concerns
- Privacy concerns
- Legal concerns
- Reliability issues
- Cost changes
- Contract changes
- Service deprecation
- Product architecture changes
- Subprocessor changes
- Enterprise requirements
- Customer requirements
- Incident response
- Compliance requirements

Vendor removal may require migration, data export, data deletion, service changes, downtime, or customer notice depending on the vendor and feature.

## 27. No Sale of User Data

SinLess Games LLC does not sell user data.

Using vendors and subprocessors to provide Helix AI is not a sale of user data when those vendors process data only for authorized Helix AI purposes.

Vendors and subprocessors should not use user data for unrelated purposes.

## 28. Contact

Questions about subprocessors, vendors, vendor changes, or data processing may be sent to:

- Privacy: `privacy@sinlessgames.com`
- Security: `security@sinlessgames.com`
- Legal: `legal@sinlessgames.com`
- Support: `support@sinlessgames.com`

Before publishing this policy, confirm these email aliases exist and are monitored.

## 29. Publication Checklist

Before publishing this document, complete the following:

- Confirm official company name: `SinLess Games LLC`
- Confirm official product name: `Helix AI`
- Confirm all active vendors
- Confirm all active subprocessors
- Confirm planned vendors
- Confirm optional vendors
- Confirm customer-controlled integrations
- Confirm vendor categories
- Confirm data categories processed by each vendor
- Confirm vendor regions
- Confirm data residency options
- Confirm security documentation links
- Confirm privacy documentation links
- Confirm data processing agreements
- Confirm AI provider data-use terms
- Confirm payment processor terms
- Confirm analytics and cookie vendors
- Confirm support vendor
- Confirm email vendor
- Confirm status page vendor
- Confirm tax provider
- Confirm object storage provider
- Confirm Redis provider
- Confirm observability provider
- Confirm error monitoring provider
- Confirm legal and compliance vendors
- Confirm vendor incident notification process
- Confirm enterprise subprocessor notice process
- Confirm subprocessor objection process
- Confirm self-hosted vendor responsibilities
- Confirm air-gapped vendor responsibilities
- Have qualified legal counsel review this document

## 30. Changes to This List

We may update this list from time to time.

When we make material changes, we will update the `last_updated` date and may provide notice through the service, documentation, account settings, email, legal notices page, release notes, or another reasonable method.

Continued use of Helix AI after changes become effective means you accept the updated list, subject to any rights provided by applicable law or written agreement.

## 31. Legal Review Notice

This document is a draft template and should be reviewed by qualified legal counsel before publication.

Subprocessor notice, vendor disclosure, international transfer, AI provider, payment processor, data residency, privacy, security, marketplace, and enterprise-contract requirements may vary by jurisdiction, customer type, deployment model, and written agreement.