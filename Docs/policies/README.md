---
title: Policy Index
description: Index of Helix AI policies, policy statuses, publication readiness, and legal review warnings.
effective_date: 2026-05-19
last_updated: 2026-05-19
owner: SinLess Games LLC
status: draft
---

# Helix AI Policy Index

## Important Notice

This directory contains Helix AI policy documents for SinLess Games LLC.

Most, if not all, policies in this directory are currently **drafts**. A draft policy is not final, has not necessarily been reviewed by qualified legal counsel, and should not be treated as ready for publication, enforcement, customer distribution, or contractual use.

Before any policy is published or relied on, it should be reviewed for:

- Legal accuracy
- Business accuracy
- Product accuracy
- Security accuracy
- Privacy accuracy
- Billing accuracy
- Compliance requirements
- Jurisdiction-specific requirements
- Consistency with actual Helix AI behavior
- Consistency with signed customer agreements
- Consistency with vendor and subprocessor agreements

Nothing in this directory is legal advice.

## Policy Statuses

Each policy should include a `status` value in its frontmatter.

Example:

```yaml
status: draft
````

The following statuses may be used.

| Status       | Meaning                                                                                                 | Publication Ready |
| ------------ | ------------------------------------------------------------------------------------------------------- | ----------------: |
| `draft`      | Early working version. Content may be incomplete, inaccurate, unreviewed, or based on planned behavior. |                No |
| `proposed`   | Draft is structured and ready for internal review, but not approved.                                    |                No |
| `in-review`  | Under review by legal, security, privacy, product, compliance, or leadership.                           |                No |
| `approved`   | Reviewed and approved internally, but not yet published or effective.                                   |           Not yet |
| `active`     | Published, effective, and intended to govern Helix AI usage.                                            |               Yes |
| `deprecated` | Still visible for historical reference, but no longer preferred. A newer policy may exist.              |                No |
| `superseded` | Replaced by another policy. Should include a link to the replacement.                                   |                No |
| `archived`   | Retained for records only. Not intended for current use.                                                |                No |
| `rejected`   | Reviewed and rejected. Should not be used unless reopened.                                              |                No |

## Status Rules

A policy should not be marked `active` until all required review and publication steps are complete.

At minimum, an `active` policy should have:

* Final legal review
* Confirmed company name
* Confirmed contact emails
* Confirmed file links
* Confirmed product behavior
* Confirmed enforcement process
* Confirmed owner
* Confirmed effective date
* Confirmed publication location
* Confirmed version or change history
* Removed or resolved publication checklist items
* Removed placeholder values
* Internal approval from SinLess Games LLC

## Recommended Review Owners

Different policies require different review owners.

| Review Area                       | Should Review                               |
| --------------------------------- | ------------------------------------------- |
| Legal enforceability              | Legal counsel                               |
| Privacy and data protection       | Privacy owner / legal counsel               |
| Security commitments              | Security owner                              |
| AI safety and model behavior      | Responsible AI owner                        |
| Billing and refunds               | Billing owner / legal counsel               |
| Payment processor compliance      | Billing owner / payment compliance reviewer |
| Marketplace and plugins           | Marketplace owner / security owner          |
| Developer platform                | Developer platform owner                    |
| Support commitments               | Support owner                               |
| Enterprise commitments            | Business owner / legal counsel              |
| Self-hosted and air-gapped claims | Engineering owner / security owner          |

## Policy Table of Contents

| Policy                                   | File                                                                   | Brief Description                                                                                                                                                                       | Current Status |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Acceptable Use Policy                    | [acceptable-use.md](./acceptable-use.md)                               | Defines prohibited and restricted use of Helix AI, including abuse, fraud, malware, unsafe automation, harassment, privacy violations, and illegal activity.                            | Draft          |
| AI Transparency Policy                   | [ai-transparency.md](./ai-transparency.md)                             | Explains how Helix AI uses AI, memory, tools, model routing, generated output, human review, and user responsibility.                                                                   | Draft          |
| Billing, Refund, and Cancellation Policy | [billing-refund-cancellation.md](./billing-refund-cancellation.md)     | Explains plans, subscriptions, renewals, cancellations, refunds, credits, failed payments, usage billing, add-ons, and billing disputes.                                                | Draft          |
| Cookie and Tracking Policy               | [cookie-tracking.md](./cookie-tracking.md)                             | Explains cookies, local storage, analytics, telemetry, consent, tracking controls, advertising choices, and browser privacy signals.                                                    | Draft          |
| Copyright Takedown Policy                | [copyright-takedown.md](./copyright-takedown.md)                       | Explains copyright complaints, DMCA-style takedowns, counter-notices, repeat infringers, marketplace copyright rules, and copyright contacts.                                           | Draft          |
| Data Policy                              | [data.md](./data.md)                                                   | Explains data ownership, no-sale commitment, business logic use, approved research use, retention, export, deletion, memory, files, integrations, and data controls.                    | Draft          |
| Developer Policy                         | [developer.md](./developer.md)                                         | Defines rules for APIs, SDKs, webhooks, plugins, integrations, marketplace publishing, developer data handling, security, AI use, and attribution.                                      | Draft          |
| Incident Notification Policy             | [incident-notification.md](./incident-notification.md)                 | Explains how Helix AI classifies, communicates, escalates, and reports service, security, privacy, data, AI safety, automation, and vendor incidents.                                   | Draft          |
| Payment Processor Compliance Policy      | [payment-proccessor-compliance.md](./payment-proccessor-compliance.md) | Explains payment processor rules, prohibited transactions, restricted activity, fraud prevention, chargebacks, sanctions, marketplace payments, and payout compliance.                  | Draft          |
| Privacy Policy                           | [privacy.md](./privacy.md)                                             | Explains collection, use, sharing, retention, rights, cookies, AI processing, data requests, children’s data, international transfers, and privacy contacts.                            | Draft          |
| Responsible AI Policy                    | [responsible-ai.md](./responsible-ai.md)                               | Defines responsible AI principles, human oversight, high-risk-use restrictions, model evaluation, red-team testing, automation safeguards, and AI governance.                           | Draft          |
| Security Policy                          | [security.md](./security.md)                                           | Explains account security, data protection, infrastructure security, API security, AI security, vulnerability disclosure, incident response, and self-hosted security responsibilities. | Draft          |
| Subprocessor and Vendor List             | [subprocessor-vendor-list.md](./subprocessor-vendor-list.md)           | Lists current, planned, optional, and customer-controlled vendors and subprocessors used or expected for Helix AI.                                                                      | Draft          |
| Support Policy                           | [support.md](./support.md)                                             | Explains support channels, support scope, out-of-scope work, priority levels, response targets, escalation, enterprise support, and self-hosted support.                                | Draft          |
| Terms of Use                             | [terms-of-use.md](./terms-of-use.md)                                   | Defines the core legal terms for using Helix AI, including accounts, AI output, user data, subscriptions, APIs, marketplace, liability, and termination.                                | Draft          |
| Underage Policy                          | [underage.md](./underage.md)                                           | Explains minors, age-restricted content, lawful and verifiable age assurance, parental controls, child safety, school use, and minor account restrictions.                              | Draft          |
| User-Generated Content Policy            | [user-generated-content.md](./user-generated-content.md)               | Explains user ownership of generated content, required Helix AI attribution, public sharing, moderation, copyright, marketplace content, and synthetic media rules.                     | Draft          |

## Filename Notes

The file `payment-proccessor-compliance.md` currently uses the spelling `proccessor`.

Consider renaming it before publication:

```text
payment-processor-compliance.md
```

If renamed, update all internal policy links that point to the current filename.

## Missing or Future Policies

The following policies may be added later depending on product scope, enterprise requirements, marketplace launch timing, and compliance needs.

| Future Policy                                    | Suggested File                             | Purpose                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace Policy                               | `marketplace.md`                           | Rules for marketplace publishing, review, permissions, takedowns, ratings, revenue share, versioning, and private marketplaces. |
| Accessibility Statement                          | `accessibility.md`                         | Public accessibility commitment, target standard, known limitations, feedback channel, and remediation process.                 |
| SLA Policy                                       | `sla.md`                                   | Uptime commitments, service credits, exclusions, maintenance windows, claim process, and enterprise availability terms.         |
| Law Enforcement Request Policy                   | `law-enforcement-requests.md`              | Explains how Helix AI handles subpoenas, warrants, emergency requests, preservation requests, and user notice.                  |
| Open Source Contribution Policy                  | `open-source-contribution.md`              | Rules for community contributions, licensing, DCO/CLA, maintainership, security reports, and project governance.                |
| Community Code of Conduct                        | `code-of-conduct.md`                       | Rules for GitHub, Discord, forums, marketplace reviews, docs contributions, and community interactions.                         |
| Ethical Automation Policy                        | `ethical-automation.md`                    | Specific rules for reversible, irreversible, sensitive, destructive, and high-impact automations.                               |
| Business Continuity and Disaster Recovery Policy | `business-continuity-disaster-recovery.md` | Recovery objectives, backups, failover, disaster recovery testing, degraded mode, and continuity responsibilities.              |
| Vendor Risk Management Policy                    | `vendor-risk-management.md`                | Internal process for approving, reviewing, monitoring, and removing vendors and subprocessors.                                  |
| Records Retention Policy                         | `records-retention.md`                     | Defines retention periods for logs, audit records, billing records, support tickets, legal records, and customer data.          |

## Publication Readiness Checklist

Before publishing the policy directory, complete the following:

* Confirm all filenames.
* Fix broken links.
* Confirm all policy frontmatter.
* Confirm every policy has an owner.
* Confirm every policy has an effective date.
* Confirm every policy has a last updated date.
* Confirm every policy has a status.
* Confirm all placeholder values are resolved.
* Confirm all email aliases exist and are monitored.
* Confirm official company name.
* Confirm official product name.
* Confirm physical business address where required.
* Confirm governing law and venue in Terms of Use.
* Confirm cancellation flow and refund process.
* Confirm support hours and support targets.
* Confirm status page URL.
* Confirm subprocessor list.
* Confirm payment processors.
* Confirm AI providers.
* Confirm analytics and tracking tools.
* Confirm model training defaults.
* Confirm research-use defaults.
* Confirm underage access rules.
* Confirm age assurance process.
* Confirm parental control features.
* Confirm attribution requirements.
* Confirm marketplace launch scope.
* Confirm developer/API launch scope.
* Confirm self-hosted and air-gapped behavior.
* Confirm enterprise contract precedence language.
* Confirm legal review is complete.
* Mark only reviewed and approved policies as `active`.

## Recommended Directory Structure

```text
Docs/
└── policies/
    ├── README.md
    ├── acceptable-use.md
    ├── ai-transparency.md
    ├── billing-refund-cancellation.md
    ├── cookie-tracking.md
    ├── copyright-takedown.md
    ├── data.md
    ├── developer.md
    ├── incident-notification.md
    ├── payment-proccessor-compliance.md
    ├── privacy.md
    ├── responsible-ai.md
    ├── security.md
    ├── subprocessor-vendor-list.md
    ├── support.md
    ├── terms-of-use.md
    ├── underage.md
    └── user-generated-content.md
```

## Recommended Policy Lifecycle

```text
draft
  ↓
proposed
  ↓
in-review
  ↓
approved
  ↓
active
  ↓
deprecated / superseded / archived
```

A rejected policy should be marked:

```yaml
status: rejected
```

A superseded policy should identify the replacement:

```yaml
status: superseded
superseded_by: ./replacement-policy.md
```

A deprecated policy should explain why it is deprecated:

```yaml
status: deprecated
deprecated_reason: Replaced by updated marketplace policy.
```

## Final Warning

Until a policy is marked `active`, it should be treated as a planning draft only.

Draft policies should not be represented to users, customers, regulators, vendors, partners, marketplace publishers, or enterprise prospects as final legal terms.

Qualified legal counsel should review all policies before publication.
