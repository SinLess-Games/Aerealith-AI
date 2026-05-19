---
title: Security Policy
description: Explains how Helix AI protects users, organizations, data, accounts, infrastructure, integrations, automations, APIs, plugins, and marketplace items.
effective_date: 2026-05-18
last_updated: 2026-05-18
owner: SinLess Games LLC
status: draft
---

# Security Policy

## 1. Purpose

This Security Policy explains how SinLess Games LLC approaches security for Helix AI.

Helix AI is designed to help users think, create, automate, analyze, monitor, and act across connected systems. Because Helix AI may process prompts, files, memory, integrations, automations, plugins, analytics, dashboards, APIs, organization workspaces, infrastructure workflows, and marketplace items, security is a core requirement of the platform.

This policy explains:

- Security responsibilities
- Account protection
- Data protection
- Infrastructure security
- Application security
- API security
- AI and automation security
- Plugin and marketplace security
- Vulnerability management
- Logging and monitoring
- Incident response
- Security reporting
- Self-hosted, hybrid, and air-gapped deployment responsibilities

## 2. Scope

This policy applies to Helix AI services, including:

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
- Organization workspaces
- Cloud-hosted deployments
- Self-hosted deployments, where applicable
- Hybrid deployments, where applicable
- Air-gapped deployments, where applicable

This policy applies to:

- Individual users
- Organization users
- Workspace administrators
- Enterprise customers
- Developers
- Marketplace publishers
- API users
- Contractors
- Vendors
- Subprocessors
- SinLess Games LLC employees and authorized operators
- Anyone who accesses, manages, integrates with, or operates Helix AI

## 3. Core Security Commitments

SinLess Games LLC intends to operate Helix AI according to the following security commitments:

1. Protect user data, organization data, and system integrity.
2. Use reasonable technical and organizational safeguards.
3. Apply least-privilege access controls.
4. Protect data in transit and at rest where practical.
5. Separate ordinary user content from secrets and credentials.
6. Use approved secret-management systems for sensitive credentials.
7. Log and monitor security-relevant activity.
8. Investigate suspected security incidents.
9. Provide a responsible way to report vulnerabilities.
10. Reduce risk from unsafe automations, plugins, integrations, and AI tool use.
11. Support enterprise and self-hosted security controls where appropriate.
12. Continuously improve security based on risk, incidents, testing, and operational experience.

## 4. Relationship to Other Policies

This policy works together with other Helix AI policies, including:

- [Terms of Use](./terms-of-use.md)
- [Privacy Policy](./privacy.md)
- [Data Policy](./data.md)
- [Acceptable Use Policy](./acceptable-use.md)
- [AI Transparency Policy](./ai-transparency.md)
- [Responsible AI Policy](./responsible-ai.md)
- [Cookie and Tracking Policy](./cookie-tracking.md)
- [Billing, Refund, and Cancellation Policy](./billing-refund-cancellation.md)
- [Copyright Takedown Policy](./copyright-takedown.md)
- [Incident Notification Policy](./incident-notification.md)
- [Payment Processor Compliance Policy](./payment-proccessor-compliance.md)
- [User-Generated Content Policy](./user-generated-content.md)
- [Marketplace Policy](./marketplace.md)
- [Developer and API Policy](./developer-api.md)
- [Subprocessor Vendor List](./subprocessor-vendor-list.md)
- [Support Policy](./support-policy.md)
- [Underage Policy](./underage-policy.md)

If there is a conflict between this policy and a written agreement signed by SinLess Games LLC, the written agreement controls only to the extent of that conflict.

## 5. Shared Responsibility

Security is a shared responsibility between SinLess Games LLC, users, organizations, developers, marketplace publishers, and deployment operators.

SinLess Games LLC is responsible for reasonable security controls for Helix AI systems operated by SinLess Games LLC.

Users are responsible for securing their accounts, devices, credentials, integrations, automations, API keys, uploaded data, and connected systems.

Organizations are responsible for configuring users, roles, permissions, retention, integrations, audit settings, marketplace controls, automations, and security policies for their own workspaces.

Developers and marketplace publishers are responsible for securing their applications, plugins, APIs, code, dependencies, permissions, data handling, and user-facing disclosures.

Self-hosted, hybrid, and air-gapped deployment operators are responsible for securing their own infrastructure, networks, storage, backups, logs, users, integrations, and deployment configurations.

## 6. User Security Responsibilities

Users must take reasonable steps to protect their Helix AI accounts and connected systems.

Users are responsible for:

- Using strong, unique passwords where passwords are used
- Enabling multi-factor authentication where available
- Protecting passkeys, recovery codes, and authentication devices
- Keeping account email addresses secure
- Keeping devices updated and protected
- Reviewing active sessions
- Signing out from shared or untrusted devices
- Reporting suspicious account activity
- Protecting API keys, tokens, passwords, private keys, and secrets
- Avoiding secrets in ordinary prompts, files, memory, chats, or support messages
- Reviewing integrations before connecting them
- Disconnecting integrations that are no longer needed
- Reviewing automations before enabling them
- Testing generated code and infrastructure changes before production use
- Following organization security policies

## 7. Organization Security Responsibilities

Organizations are responsible for configuring Helix AI according to their risk profile.

Organization administrators are responsible for:

- Managing users
- Managing roles and permissions
- Removing users who no longer need access
- Reviewing administrator access
- Enforcing multi-factor authentication where appropriate
- Managing integrations
- Managing API keys
- Managing service accounts
- Managing automations
- Managing marketplace access
- Reviewing audit logs
- Configuring retention
- Configuring data export controls
- Configuring memory settings
- Configuring approved models and tools
- Configuring plugin allowlists or blocklists
- Configuring security notifications
- Responding to internal incidents
- Training users on safe use
- Ensuring compliance with applicable laws, contracts, and internal policies

## 8. Account Security

Helix AI may support account security features such as:

- Password authentication
- Passkeys
- Magic links
- OAuth authentication
- Multi-factor authentication
- Session management
- Device recognition
- Login alerts
- Suspicious activity detection
- Account recovery flows
- Session revocation
- Organization-managed access
- Single sign-on for eligible plans
- Role-based access controls
- Attribute-based access controls, where supported

Users and organizations should use the strongest authentication options available for their plan and deployment.

## 9. Authentication

Authentication controls are intended to verify that users are who they claim to be.

Authentication safeguards may include:

- Secure password hashing
- Multi-factor authentication
- Passkey support
- OAuth provider controls
- Magic-link expiration
- Session expiration
- Token rotation
- Login rate limits
- Brute-force protection
- Suspicious login detection
- Account recovery protections
- Secure session cookies
- Protection against cross-site request forgery
- Protection against session fixation

Authentication methods may vary by plan, deployment type, and configuration.

## 10. Authorization

Authorization controls are intended to limit what authenticated users and systems can access.

Authorization safeguards may include:

- Role-based access control
- Attribute-based access control
- Workspace-level permissions
- Organization-level permissions
- API scopes
- Integration scopes
- Plugin permission prompts
- Marketplace approval controls
- Admin-only actions
- Separate billing roles
- Separate security roles
- Least-privilege service accounts
- Access reviews
- Permission audit logs
- Enterprise SSO and directory controls, where available

Users and organizations should only grant the permissions needed for the intended task.

## 11. Data Protection

Helix AI should protect data using reasonable technical and organizational safeguards.

Data protection controls may include:

- Encryption in transit
- Encryption at rest
- Access controls
- Role-based permissions
- Attribute-based permissions
- Secret management
- Network segmentation
- Audit logs
- Backups
- Monitoring
- Data minimization
- Retention controls
- Secure deletion workflows where supported
- Organization-level administrative controls
- Subprocessor review
- Incident response procedures

Data handling is further described in the [Data Policy](./data.md) and [Privacy Policy](./privacy.md).

## 12. Encryption

Helix AI should use encryption where appropriate to protect data.

Encryption controls may include:

- TLS for data in transit
- Encryption at rest for databases and storage
- Encrypted backups where supported
- Encrypted secrets storage
- Key management controls
- Key rotation practices
- Customer-managed keys for eligible enterprise deployments, where supported
- Separate encryption controls for self-hosted or air-gapped deployments, where applicable

Encryption does not remove the need for strong access controls, secure configuration, monitoring, and responsible data handling.

## 13. Secrets and Credentials

Secrets must be handled with stronger controls than ordinary user content.

Secrets may include:

- Passwords
- API keys
- OAuth tokens
- Session tokens
- Private keys
- SSH keys
- Signing keys
- Database credentials
- Cloud credentials
- Payment credentials
- Webhook secrets
- Recovery codes
- Encryption keys
- Deployment credentials

Secrets should be stored in approved secret-management systems such as Vault, KMS, cloud secret managers, or customer-controlled secret stores.

Secrets should not be stored in:

- Ordinary prompts
- Ordinary chat history
- Ordinary memory
- Public documentation
- Source code
- Unencrypted files
- Support tickets
- Plain-text logs
- Analytics events
- Screenshots
- Marketplace descriptions
- Plugin metadata unless specifically designed for secure secret references

If secrets are detected in unsafe locations, SinLess Games LLC may redact, restrict, remove, rotate, alert, or recommend remediation where supported.

## 14. Infrastructure Security

Helix AI infrastructure should be managed using reasonable security practices.

Infrastructure security controls may include:

- Hardened runtime environments
- Secure cloud configuration
- Network segmentation
- Firewall controls
- Private networking where appropriate
- Secure service-to-service communication
- Least-privilege infrastructure access
- Infrastructure as code
- Change review
- Secure deployment pipelines
- Vulnerability scanning
- Patch management
- Logging and monitoring
- Backup and recovery controls
- Production access restrictions
- Administrative audit logs
- Emergency access procedures
- Environment separation

Infrastructure controls may vary between cloud-hosted, self-hosted, hybrid, and air-gapped deployments.

## 15. Network Security

Helix AI may use network security controls to reduce unauthorized access and service abuse.

Network security controls may include:

- TLS
- Firewalls
- Web application firewalls
- Rate limits
- DDoS protection
- Private service networks
- Network policies
- Service mesh controls, where applicable
- Segmented environments
- Restricted administrative ports
- IP allowlists for enterprise features, where supported
- Secure DNS configuration
- Secure ingress and egress controls
- Monitoring for unusual network traffic

Organizations operating self-hosted deployments are responsible for their own network security configuration.

## 16. Application Security

Helix AI should be developed using secure application development practices.

Application security practices may include:

- Secure code review
- Dependency review
- Static analysis
- Dynamic testing
- Input validation
- Output encoding
- Access control testing
- Authentication testing
- API security testing
- Secure error handling
- Cross-site scripting prevention
- Cross-site request forgery prevention
- Server-side request forgery prevention
- SQL injection prevention
- Command injection prevention
- File upload validation
- Secure session management
- Secure cookie settings
- Secure headers
- Abuse-prevention controls
- Logging of security-relevant actions

Application security controls should be reviewed and improved over time.

## 17. Secure Development Lifecycle

Helix AI should follow a secure development lifecycle appropriate to the risk of the feature.

Secure development practices may include:

- Threat modeling
- Security requirements
- Privacy review
- Responsible AI review
- Secure coding standards
- Code review
- Automated tests
- Dependency scanning
- Secret scanning
- Container scanning
- Infrastructure scanning
- Security regression testing
- Release review
- Change management
- Rollback planning
- Post-release monitoring
- Incident feedback loops

Higher-risk features should receive stronger review and testing.

## 18. Supply Chain Security

Helix AI may depend on third-party code, libraries, services, containers, APIs, plugins, models, and infrastructure.

Supply chain security controls may include:

- Dependency scanning
- Vulnerability monitoring
- Lockfiles
- Version pinning where appropriate
- Signed artifacts where practical
- Container image scanning
- Software bill of materials where practical
- Review of critical dependencies
- Least-privilege CI/CD credentials
- Secret scanning
- Protected branches
- Required reviews
- Build provenance
- Vendor risk review
- Marketplace package review
- Plugin signing, where supported

Developers and marketplace publishers are responsible for the security of their own dependencies and packages.

## 19. API Security

Helix AI APIs should be protected by appropriate controls.

API security controls may include:

- Authentication
- Authorization
- API keys
- OAuth scopes
- Rate limits
- Request validation
- Response validation
- Audit logs
- Abuse detection
- Key rotation
- Token expiration
- Webhook signing
- Idempotency controls
- Replay protection
- Least-privilege scopes
- Organization-level API restrictions
- Developer policy enforcement
- Monitoring for unusual API activity

Users and developers are responsible for securing API keys and tokens.

API keys should not be embedded in public client-side code, public repositories, public documentation, or ordinary prompts.

## 20. Webhook Security

Helix AI may use webhooks for integrations, billing, marketplace events, automations, and developer workflows.

Webhook security controls may include:

- Signature verification
- Timestamp validation
- Replay protection
- Idempotency
- Least-privilege endpoints
- Secure secret storage
- Secret rotation
- Request size limits
- Error handling
- Event logging
- Retry controls
- Monitoring for failed events
- Alerts for suspicious webhook activity

Developers should verify webhook signatures before trusting webhook payloads.

## 21. AI Security

Helix AI AI-powered features should be designed to reduce AI-specific security risks.

AI security risks may include:

- Prompt injection
- Jailbreak attempts
- Data leakage
- Context leakage
- Unauthorized tool use
- Unsafe automation execution
- Memory poisoning
- Retrieval poisoning
- Malicious document instructions
- Malicious webpage instructions
- Malicious email instructions
- Plugin output manipulation
- Model routing errors
- Excessive data exposure to models
- Unsafe code generation
- Hallucinated security advice
- Social engineering assistance
- Credential exposure

AI security controls may include:

- Instruction hierarchy
- Tool permission boundaries
- Human confirmation for sensitive actions
- Retrieval filtering
- Source trust controls
- Prompt injection testing
- Context isolation
- Sensitive-data redaction where practical
- Model routing restrictions
- Organization-approved model policies
- Approval gates for high-impact actions
- Logging of tool and automation actions
- Monitoring for unsafe behavior
- Incident escalation

AI security is further described in the [Responsible AI Policy](./responsible-ai.md) and [AI Transparency Policy](./ai-transparency.md).

## 22. Prompt Injection Protection

Prompt injection occurs when untrusted content attempts to override instructions, steal data, manipulate tools, or alter AI behavior.

Untrusted content may include:

- Webpages
- Emails
- Files
- PDFs
- Source code
- Logs
- Tickets
- Chat messages
- Plugin outputs
- Tool outputs
- Marketplace items
- Retrieved documents
- User-generated content

Helix AI should reduce prompt injection risk through reasonable controls, including:

- Treating external content as untrusted
- Separating user instructions from retrieved content
- Preventing retrieved content from overriding system or developer instructions
- Requiring confirmation for sensitive actions
- Restricting tool access based on permissions
- Avoiding unnecessary exposure of private context
- Warning users when content may be untrusted
- Testing high-risk workflows for prompt injection

Users should be careful when asking Helix AI to process untrusted content.

## 23. Automation Security

Helix AI automations should be designed and configured with appropriate safeguards.

Automation security controls may include:

- Clear ownership
- Permission checks
- Trigger validation
- Scope limits
- Rate limits
- Approval gates
- Human confirmation
- Dry-run mode
- Rollback plans
- Audit logs
- Error handling
- Notifications
- Expiration dates
- Least-privilege credentials
- Separation between read-only and write actions
- Pause and disable controls
- Monitoring for repeated failures
- Alerts for unexpected behavior

High-risk, destructive, irreversible, externally visible, or security-sensitive automations should require stronger controls.

## 24. Tool and Integration Security

Helix AI may connect to third-party tools and services.

Tool and integration security controls may include:

- Explicit authorization
- OAuth scopes
- Least-privilege permissions
- Token storage protections
- Token revocation
- Integration health checks
- Action logging
- Permission review
- Organization approval
- Admin controls
- Integration disablement
- Secure callback handling
- Vendor review
- Data minimization

Users and organizations should only connect tools they trust and should regularly review connected integrations.

## 25. Plugin and Marketplace Security

Helix AI may support plugins, workflows, dashboards, templates, connectors, personalities, and marketplace items.

Plugin and marketplace security controls may include:

- Publisher identity review
- Permission declarations
- Security review
- Privacy review
- Dependency review
- Sandboxing
- Runtime restrictions
- Network restrictions
- File access restrictions
- Secret access restrictions
- Signing or verification
- Version review
- Update review
- Abuse monitoring
- User reporting
- Organization allowlists
- Organization blocklists
- Takedown procedures

Marketplace publishers may not:

- Include malware
- Include spyware
- Steal credentials
- Exfiltrate user data
- Hide tracking
- Request excessive permissions
- Bypass safety controls
- Bypass organization controls
- Hide network calls
- Misrepresent security behavior
- Continue operating after removal or suspension

Marketplace security is also governed by the [Marketplace Policy](./marketplace.md), [Developer and API Policy](./developer-api.md), and [Acceptable Use Policy](./acceptable-use.md).

## 26. Logging and Monitoring

Helix AI may collect logs and monitoring data to support security, reliability, debugging, billing, abuse prevention, and incident response.

Logs may include:

- Authentication events
- Authorization events
- Account changes
- Organization changes
- Permission changes
- API usage
- Rate-limit events
- Tool calls
- Automation actions
- Plugin actions
- Integration activity
- Security alerts
- System errors
- Performance metrics
- Billing events
- Administrative actions
- Incident response records

Logs should be protected from unauthorized access.

Logs should avoid unnecessary sensitive data where practical.

Logs may be retained according to applicable retention rules, security needs, legal obligations, and enterprise agreements.

## 27. Audit Logs

Helix AI may provide audit logs for organization and enterprise customers where supported.

Audit logs may include:

- User sign-ins
- User invitations
- Role changes
- Permission changes
- Workspace changes
- Integration changes
- API key creation or deletion
- Automation creation or execution
- Marketplace installation
- Data export events
- Admin actions
- Security settings changes
- Billing administrator changes
- Policy changes
- Tool execution events

Audit log availability, retention, export, and detail level may depend on plan, deployment type, and enterprise agreement.

## 28. Vulnerability Management

SinLess Games LLC should maintain a vulnerability management process for Helix AI systems it operates.

Vulnerability management may include:

- Vulnerability scanning
- Dependency scanning
- Container scanning
- Code scanning
- Infrastructure scanning
- Secret scanning
- Security advisories
- Patch tracking
- Risk-based prioritization
- Remediation timelines
- Verification testing
- Exception tracking
- Customer notification where appropriate

Vulnerability severity may be assessed based on exploitability, impact, exposure, affected systems, compensating controls, and customer risk.

## 29. Security Testing

Helix AI may use security testing to identify and reduce risk.

Security testing may include:

- Code review
- Static application security testing
- Dynamic application security testing
- Dependency scanning
- Container scanning
- Infrastructure scanning
- Cloud configuration review
- API security testing
- Authentication testing
- Authorization testing
- Prompt injection testing
- Plugin sandbox testing
- Penetration testing
- Red-team exercises
- Incident response exercises
- Backup recovery testing

Security testing should be proportional to feature risk and deployment type.

## 30. Vulnerability Disclosure

SinLess Games LLC encourages responsible reporting of suspected security vulnerabilities.

Security reports should be sent to:

`security@sinlessgames.com`

Before publishing this policy, confirm this email alias exists and is monitored.

When reporting a vulnerability, include as much detail as possible, such as:

- Affected service, endpoint, feature, plugin, or marketplace item
- Steps to reproduce
- Expected behavior
- Actual behavior
- Impact assessment
- Proof of concept, if safe to include
- Screenshots or logs
- Browser, app, API, or SDK version
- Account or workspace involved, if relevant
- Whether the issue may expose data
- Whether the issue may allow unauthorized access
- Contact information for follow-up

Do not include passwords, private keys, access tokens, payment card numbers, or unnecessary sensitive data in vulnerability reports.

## 31. Authorized Security Research

Good-faith security research is welcome when it is lawful, safe, and responsible.

Authorized research must follow these rules:

- Do not access, modify, delete, or exfiltrate data that is not yours.
- Do not disrupt Helix AI services.
- Do not perform denial-of-service testing.
- Do not perform social engineering.
- Do not perform phishing.
- Do not attack employees, contractors, users, vendors, or customers.
- Do not use malware.
- Do not create persistence.
- Do not bypass payment systems.
- Do not abuse support systems.
- Do not publicly disclose the vulnerability before SinLess Games LLC has had a reasonable opportunity to investigate and remediate.
- Stop testing and report immediately if you encounter personal data, secrets, confidential information, or data belonging to others.

Testing must be limited to accounts, workspaces, systems, plugins, or deployments you own or are explicitly authorized to test.

## 32. Out-of-Scope Security Testing

The following activities are not authorized unless SinLess Games LLC gives written permission:

- Denial-of-service testing
- Load testing against production systems
- Spam testing
- Phishing or social engineering
- Physical security testing
- Attacks against employees or contractors
- Attacks against users or customers
- Attacks against vendors or subprocessors
- Malware deployment
- Credential stuffing
- Password spraying
- Automated high-volume scanning
- Exfiltration of data
- Destructive testing
- Persistence testing
- Attempts to access billing systems without authorization
- Attempts to bypass payment processor controls
- Attempts to manipulate marketplace payouts
- Testing that violates applicable law

## 33. Vulnerability Response

When SinLess Games LLC receives a vulnerability report, it may:

- Acknowledge receipt
- Request additional information
- Validate the report
- Assess severity
- Prioritize remediation
- Apply mitigations
- Develop a fix
- Test the fix
- Deploy the fix
- Monitor for exploitation
- Notify affected users or organizations where appropriate
- Credit the reporter where appropriate and permitted
- Decline reports that are invalid, abusive, unsafe, duplicate, or out of scope

SinLess Games LLC does not guarantee a bounty, reward, payment, public credit, or specific response timeline unless a separate written bug bounty program says otherwise.

## 34. Incident Response

SinLess Games LLC should maintain an incident response process for security, privacy, data, availability, AI safety, automation, marketplace, and operational incidents.

Incident response may include:

- Detection
- Triage
- Severity classification
- Containment
- Investigation
- Evidence preservation
- Eradication
- Recovery
- Communication
- User notification where appropriate
- Regulator notification where required
- Vendor coordination
- Post-incident review
- Corrective actions
- Preventive actions

Incident handling and user notifications are further described in the [Incident Notification Policy](./incident-notification.md).

## 35. Data Breach Response

If SinLess Games LLC becomes aware of a suspected or confirmed data breach affecting Helix AI, it will evaluate the incident and take appropriate action.

Actions may include:

- Investigating the scope and cause
- Containing the incident
- Preserving evidence
- Rotating credentials where appropriate
- Blocking unauthorized access
- Fixing vulnerabilities
- Notifying affected users or organizations where required
- Notifying regulators where required
- Notifying subprocessors where appropriate
- Providing mitigation guidance
- Improving controls after the incident

Notification timing and content may depend on law, contract, incident severity, confirmed facts, and risk of harm.

## 36. Backup and Recovery

Helix AI may maintain backups to support reliability, disaster recovery, business continuity, and incident response.

Backup and recovery controls may include:

- Regular backups
- Backup encryption where supported
- Access controls
- Backup integrity checks
- Restore testing
- Retention rules
- Separation from production systems where practical
- Disaster recovery procedures
- Recovery time and recovery point objectives for eligible plans
- Enterprise-specific backup terms where agreed

Backups may retain data for a limited period after deletion from active systems.

Backup behavior is also described in the [Data Policy](./data.md) and [Privacy Policy](./privacy.md).

## 37. Business Continuity and Disaster Recovery

SinLess Games LLC should maintain reasonable business continuity and disaster recovery planning for Helix AI systems it operates.

Continuity planning may include:

- Critical system identification
- Recovery procedures
- Backup procedures
- Incident escalation
- Vendor escalation
- Communication plans
- Status page updates
- Emergency access procedures
- Disaster recovery testing
- Tabletop exercises
- Service restoration priorities

Specific uptime commitments, if any, are governed by the applicable [Support Policy](./support-policy.md), service-level agreement, order form, or enterprise agreement.

## 38. Security of AI Memory

Helix AI memory may contain user preferences, project context, organization context, technical environment details, or other user-controlled information.

Memory security controls may include:

- User controls
- Organization controls
- Access restrictions
- Scope boundaries
- Sensitivity labels
- Retention settings
- Export controls
- Delete controls
- Audit records where appropriate
- Restrictions on storing secrets
- Restrictions on sensitive or regulated data
- Separation between personal, organization, workspace, project, and automation memory

Users should not store passwords, API keys, private keys, access tokens, or other secrets in ordinary memory.

## 39. Security of Generated Code and Configurations

Helix AI may generate code, scripts, commands, infrastructure configuration, deployment manifests, database queries, firewall rules, CI/CD workflows, and other technical outputs.

Users are responsible for reviewing and testing generated outputs before use.

Generated technical outputs should be checked for:

- Security vulnerabilities
- Unauthorized access
- Overly broad permissions
- Secret exposure
- Dangerous commands
- Data deletion
- Destructive behavior
- Dependency risk
- License issues
- Production impact
- Backup impact
- Logging impact
- Compliance impact
- Rollback requirements

Helix AI outputs should not be blindly executed in production.

## 40. Security of Uploaded Files

Uploaded files may be scanned, processed, indexed, embedded, or analyzed depending on the feature.

File security controls may include:

- File type restrictions
- File size limits
- Malware scanning where supported
- Content validation
- Storage access controls
- Temporary processing controls
- Retrieval permissions
- Organization sharing controls
- Public link restrictions
- Retention controls
- Deletion controls

Users are responsible for ensuring that uploaded files do not contain malware, unauthorized data, secrets, or content they are not allowed to process.

## 41. Security of Public Sharing

Some Helix AI features may allow sharing of chats, files, dashboards, reports, plugins, marketplace items, workflows, templates, or generated content.

Users are responsible for reviewing shared content before publishing.

Publicly shared content should not include:

- Passwords
- API keys
- Private keys
- Access tokens
- Session tokens
- Personal data without authorization
- Confidential business information
- Regulated data
- Internal infrastructure details
- Security-sensitive logs
- Private customer data
- Non-public source code unless authorized
- Data belonging to another user or organization

Public content may be indexed, copied, downloaded, cached, retained, or shared by others.

## 42. Payment Security

Helix AI may use third-party payment processors to process subscriptions, invoices, add-ons, marketplace purchases, refunds, taxes, and payouts.

Payment security controls may include:

- Use of trusted payment processors
- Avoiding direct storage of full payment card numbers
- Tokenized payment methods
- Secure checkout flows
- Payment webhook signature verification
- Fraud monitoring
- Chargeback monitoring
- Billing audit records
- Restricted billing administrator permissions
- Secure handling of tax and invoice records

Users should not send full card numbers, CVV codes, bank credentials, payment passwords, or payment secrets through ordinary support messages, chat prompts, files, or unapproved channels.

Payment behavior is further described in the [Billing, Refund, and Cancellation Policy](./billing-refund-cancellation.md) and [Payment Processor Compliance Policy](./payment-proccessor-compliance.md).

## 43. Vendor and Subprocessor Security

SinLess Games LLC may use vendors and subprocessors to operate Helix AI.

Vendor security controls may include:

- Vendor review
- Contractual security obligations
- Data processing agreements
- Confidentiality obligations
- Security documentation review
- Subprocessor list maintenance
- Incident notification requirements
- Access limitation
- Periodic reassessment for critical vendors

Subprocessors should be listed in the [Subprocessor Vendor List](./subprocessor-vendor-list.md).

## 44. Employee and Contractor Access

Access by SinLess Games LLC employees, contractors, or authorized operators should be limited according to role and need.

Internal access controls may include:

- Least-privilege access
- Role-based permissions
- Administrative access review
- Multi-factor authentication
- Device security requirements
- Logging of administrative access
- Separation of duties
- Confidentiality obligations
- Security training
- Access removal after role change or termination
- Emergency access controls

Private user content should only be accessed when needed for legitimate service business logic, approved research, support, security, incident response, legal compliance, or user-authorized assistance.

## 45. Security Training

SinLess Games LLC should provide appropriate security guidance or training for employees, contractors, and operators with access to Helix AI systems.

Training may include:

- Account security
- Phishing awareness
- Data handling
- Secure development
- Incident reporting
- Secret handling
- Privacy basics
- AI security risks
- Prompt injection risks
- Vendor security
- Customer data handling
- Access control responsibilities

Training should be updated as product, security, and operational risks evolve.

## 46. Compliance and Framework Alignment

Helix AI may align security practices with recognized security, privacy, and risk-management frameworks where appropriate.

Potential alignment areas may include:

- Security governance
- Access control
- Asset management
- Risk management
- Secure development
- Vulnerability management
- Incident response
- Business continuity
- Vendor management
- Audit logging
- Encryption
- Privacy controls
- AI risk management
- Enterprise security requirements

Specific certifications, attestations, audits, or compliance commitments are only provided when expressly stated by SinLess Games LLC in official documentation or written agreements.

## 47. Enterprise Security Controls

Enterprise customers may have additional security controls through product features or written agreements.

Enterprise controls may include:

- Single sign-on
- Directory sync
- Advanced role controls
- Audit log export
- Custom retention
- Data residency
- Customer-managed keys
- Dedicated environments
- Private connectivity
- IP allowlists
- Model provider restrictions
- Marketplace controls
- Private marketplace
- Custom incident notification
- Security questionnaires
- Compliance documentation
- Custom support escalation
- Self-hosted deployment
- Air-gapped deployment

Enterprise agreements control where they conflict with this policy.

## 48. Self-Hosted, Hybrid, and Air-Gapped Security

For self-hosted, hybrid, private, or air-gapped deployments, the deploying organization is responsible for much of the security environment.

The deploying organization may be responsible for:

- Infrastructure security
- Network security
- Host hardening
- Kubernetes or container security
- Database security
- Storage security
- Backup security
- Secret management
- TLS certificates
- DNS configuration
- Identity provider configuration
- User management
- Role management
- Logging and monitoring
- SIEM integration
- Patch management
- Upgrade management
- Model hosting
- Plugin approval
- Marketplace controls
- Incident response
- Disaster recovery
- Compliance configuration
- Physical security
- Air-gap integrity

SinLess Games LLC may provide official images, packages, documentation, support, updates, or security advisories for eligible self-hosted deployments.

Air-gapped deployments may not receive real-time updates, telemetry, marketplace access, or incident notifications unless configured by the customer.

## 49. Security Restrictions

Users may not use Helix AI to attack, disrupt, compromise, exploit, or gain unauthorized access to any system, account, service, device, application, model, plugin, or dataset.

Prohibited security activity includes:

- Malware
- Ransomware
- Spyware
- Credential theft
- Token theft
- Phishing
- Unauthorized vulnerability scanning
- Unauthorized exploitation
- DDoS activity
- Privilege escalation
- Persistence
- Evasion
- Data exfiltration
- Secret extraction
- Unauthorized access
- Bypassing safety systems
- Bypassing access controls
- Abusing APIs
- Abusing automations
- Abusing plugins
- Abusing marketplace items
- Tampering with logs or audit trails

Security restrictions are further described in the [Acceptable Use Policy](./acceptable-use.md).

## 50. Reporting Security Issues

Security issues should be reported to:

`security@sinlessgames.com`

Abuse or misuse should be reported to:

`abuse@sinlessgames.com`

Privacy or data concerns should be reported to:

`privacy@sinlessgames.com`

General support issues should be reported to:

`support@sinlessgames.com`

Legal notices should be sent to:

`legal@sinlessgames.com`

Before publishing this policy, confirm these email aliases exist and are monitored.

## 51. Security Report Contents

When reporting a security issue, include as much of the following as possible:

- Your name and contact information
- Affected service, endpoint, feature, plugin, or marketplace item
- Account or workspace involved, if relevant
- Description of the issue
- Steps to reproduce
- Impact assessment
- Proof of concept, if safe to provide
- Screenshots
- Logs
- Request IDs
- Trace IDs
- Browser, app, API, SDK, or plugin version
- Whether data may have been exposed
- Whether unauthorized access may be possible
- Whether the issue is actively exploited
- Recommended remediation, if known

Do not include unnecessary sensitive data.

Do not access, copy, retain, modify, delete, or disclose data that is not yours.

## 52. Security Enforcement

SinLess Games LLC may investigate suspected security violations.

Depending on the severity, risk, and context, SinLess Games LLC may:

- Warn the user or organization
- Require corrective action
- Disable API keys
- Disable sessions
- Disable integrations
- Disable automations
- Disable plugins
- Remove marketplace items
- Revoke tokens
- Rotate credentials
- Restrict accounts
- Suspend accounts
- Terminate accounts
- Notify organization administrators
- Preserve relevant records
- Notify affected users
- Notify regulators where required
- Notify law enforcement where appropriate
- Refuse future service

SinLess Games LLC may act immediately and without prior notice when necessary to protect users, systems, data, Helix AI, SinLess Games LLC, third parties, or the public.

## 53. Limitations

No system can be guaranteed to be completely secure.

Helix AI may experience vulnerabilities, outages, misconfigurations, bugs, data incidents, third-party incidents, or other security events despite reasonable safeguards.

This policy does not create a warranty, guarantee, insurance obligation, or absolute security commitment.

Specific service commitments, if any, are governed by the applicable [Support Policy](./support-policy.md), service-level agreement, order form, or written enterprise agreement.

## 54. Publication Checklist

Before publishing this policy, complete the following:

- Confirm official company name: `SinLess Games LLC`
- Confirm official product name: `Helix AI`
- Confirm monitored security email
- Confirm monitored privacy email
- Confirm monitored abuse email
- Confirm monitored support email
- Confirm responsible security owner
- Confirm vulnerability disclosure process
- Confirm incident response process
- Confirm severity classification process
- Confirm security contact escalation path
- Confirm enterprise security notification process
- Confirm audit log availability by plan
- Confirm authentication methods
- Confirm MFA availability
- Confirm SSO availability
- Confirm encryption behavior
- Confirm secret-management architecture
- Confirm backup and recovery behavior
- Confirm self-hosted security responsibilities
- Confirm air-gapped update process
- Confirm marketplace security review process
- Confirm plugin signing or sandboxing process
- Confirm API security controls
- Confirm webhook security controls
- Confirm payment security scope
- Confirm vendor security review process
- Confirm subprocessor list
- Confirm legal review

## 55. Changes to This Policy

We may update this policy from time to time.

When we make material changes, we will update the `last_updated` date and may provide notice through the service, documentation, account settings, email, release notes, legal notices page, security advisory, or another reasonable method.

Continued use of Helix AI after changes become effective means you accept the updated policy.

## 56. Contact

Questions about this policy may be sent to:

- Security: `security@sinlessgames.com`
- Privacy: `privacy@sinlessgames.com`
- Abuse: `abuse@sinlessgames.com`
- Support: `support@sinlessgames.com`
- Legal: `legal@sinlessgames.com`

Before publishing this policy, confirm these email aliases exist and are monitored.

## 57. Legal Review Notice

This policy is a draft template and should be reviewed by qualified legal counsel and security professionals before publication.

Security, privacy, breach notification, vulnerability disclosure, responsible security research, regulated-data, enterprise, payment, AI security, self-hosted deployment, and incident-response requirements may vary by jurisdiction, industry, customer type, deployment model, and written agreement.