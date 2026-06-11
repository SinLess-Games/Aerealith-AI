import type { PolicyDocument } from '../../types';

export const acceptableUsePolicy = {
  slug: 'acceptable-use',
  path: '/Policies/acceptable-use',
  meta: {
    title: 'Acceptable Use Policy',
    description: 'Rules for safe, lawful, and responsible use of Aerealith AI.',
    effectiveDate: '2026-05-18',
    lastUpdated: '2026-05-18',
    owner: 'SinLess Games LLC',
    status: 'draft',
  },
  relatedPolicies: [
    {
      label: 'Terms of Use',
      href: '/Policies/terms-of-use',
    },
    {
      label: 'Privacy Policy',
      href: '/Policies/privacy-policy',
    },
    {
      label: 'Data Policy',
      href: '/Policies/data-policy',
    },
    {
      label: 'Security Policy',
      href: '/Policies/security-policy',
    },
    {
      label: 'AI Transparency Policy',
      href: '/Policies/ai-transparency-policy',
    },
    {
      label: 'Responsible AI Policy',
      href: '/Policies/responsible-ai-policy',
    },
    {
      label: 'User-Generated Content Policy',
      href: '/Policies/user-generated-content-policy',
    },
    {
      label: 'Copyright Takedown Policy',
      href: '/Policies/copyright-takedown-policy',
    },
    {
      label: 'Underage Policy',
      href: '/Policies/underage-policy',
    },
    {
      label: 'Support Policy',
      href: '/Policies/support-policy',
    },
    {
      label: 'Subprocessor Vendor List',
      href: '/Policies/subprocessor-vendor-list',
    },
  ],
  sections: [
    {
      id: 'purpose',
      title: '1. Purpose',
      body: [
        'This Acceptable Use Policy explains what is and is not allowed when using Aerealith AI, including our websites, applications, APIs, automations, integrations, plugins, marketplace items, documentation, community spaces, and related services.',
        'Aerealith AI is designed to help users think, create, automate, analyze, monitor, and act across connected systems. Because Aerealith AI can interact with data, tools, services, and infrastructure, users must use it responsibly, lawfully, and with proper authorization.',
        'By using Aerealith AI, you agree to follow this policy, our Terms of Use, Privacy Policy, Data Policy, Security Policy, and any other policies that apply to your account, organization, subscription, or deployment.',
      ],
      links: [
        {
          label: 'Terms of Use',
          href: '/Policies/terms-of-use',
        },
        {
          label: 'Privacy Policy',
          href: '/Policies/privacy-policy',
        },
        {
          label: 'Data Policy',
          href: '/Policies/data-policy',
        },
        {
          label: 'Security Policy',
          href: '/Policies/security-policy',
        },
      ],
    },
    {
      id: 'scope',
      title: '2. Scope',
      body: [
        'This policy applies to:',
        'If you use Aerealith AI on behalf of an organization, you are responsible for ensuring that your use complies with your organization’s policies, applicable laws, and any agreements between your organization and SinLess Games LLC.',
      ],
      bullets: [
        'Individual users',
        'Organizations and workspace members',
        'Developers using Aerealith AI APIs, SDKs, plugins, or marketplace tools',
        'Users of cloud-hosted, self-hosted, hybrid, or air-gapped Aerealith AI deployments',
        'Anyone accessing Aerealith AI through integrations, automations, shared links, embedded agents, or connected services',
      ],
    },
    {
      id: 'core-rules',
      title: '3. Core Rules',
      body: [
        'You must use Aerealith AI in a way that is:',
        'You may not use Aerealith AI to harm people, systems, services, networks, organizations, communities, or the public.',
      ],
      bullets: [
        'Lawful',
        'Authorized',
        'Honest',
        'Safe',
        'Respectful of others',
        'Respectful of privacy, security, and intellectual property',
        'Consistent with this policy and related Aerealith AI policies',
      ],
    },
    {
      id: 'illegal-or-harmful-activity',
      title: '4. Illegal or Harmful Activity',
      body: [
        'You may not use Aerealith AI to plan, support, enable, conceal, or carry out illegal or harmful activity.',
        'Prohibited activity includes, but is not limited to:',
      ],
      bullets: [
        'Fraud, scams, phishing, identity theft, or financial abuse',
        'Money laundering, sanctions evasion, or illegal payment activity',
        'Trafficking, exploitation, coercion, extortion, or blackmail',
        'Terrorism, violent extremism, or recruitment for violent causes',
        'Instructions for making or using weapons to harm people',
        'Evading law enforcement or concealing criminal activity',
        'Illegal gambling or unlawful regulated activity',
        'Violating export control, sanctions, or trade restrictions',
        'Any activity that violates applicable local, state, federal, national, or international law',
      ],
    },
    {
      id: 'child-safety',
      title: '5. Child Safety',
      body: [
        'You may not use Aerealith AI to create, upload, request, store, transmit, distribute, summarize, transform, or facilitate child sexual abuse material, sexual exploitation of minors, grooming, predatory behavior, or any content that harms or exploits children.',
        'We may report apparent child exploitation material or activity to appropriate authorities and may preserve related information as required or permitted by law.',
        'Use by minors is also governed by our Underage Policy.',
      ],
      links: [
        {
          label: 'Underage Policy',
          href: '/Policies/underage-policy',
        },
      ],
    },
    {
      id: 'account-identity-and-access-abuse',
      title: '6. Account, Identity, and Access Abuse',
      body: [
        'You may not:',
        'You are responsible for activity performed through your account, API keys, automations, plugins, and connected integrations.',
      ],
      bullets: [
        'Create accounts using false, misleading, or stolen information',
        'Impersonate another person, organization, employee, agent, system, or service',
        'Misrepresent your affiliation with another person or organization',
        'Sell, rent, transfer, or share accounts in a way that bypasses plan limits or security controls',
        'Use another person’s account, API key, token, session, credentials, or connected integration without authorization',
        'Bypass authentication, authorization, rate limits, billing limits, entitlement checks, or access controls',
        'Attempt to access another user’s workspace, organization, memory, files, logs, automations, integrations, or secrets without permission',
      ],
    },
    {
      id: 'security-abuse',
      title: '7. Security Abuse',
      body: [
        'You may not use Aerealith AI to attack, disrupt, compromise, exploit, or gain unauthorized access to any system, service, account, device, application, network, model, plugin, or dataset.',
        'Prohibited security abuse includes, but is not limited to:',
        'Good-faith security research is only permitted when it is lawful, authorized, non-destructive, and consistent with our Security Policy. Testing must be limited to systems you own or systems where you have explicit permission to test.',
      ],
      bullets: [
        'Malware, ransomware, spyware, worms, trojans, botnets, rootkits, or destructive code',
        'Credential theft, token theft, session hijacking, phishing, or social engineering',
        'Unauthorized vulnerability scanning, exploitation, or penetration testing',
        'DDoS activity, traffic flooding, service disruption, or resource exhaustion',
        'Privilege escalation, persistence, evasion, or unauthorized lateral movement',
        'Exploit chaining against systems you do not own or administer',
        'Bypassing safety systems, detection systems, access controls, or monitoring',
        'Exfiltrating, exposing, decoding, or misusing secrets, tokens, passwords, private keys, or credentials',
        'Using Aerealith AI to generate, improve, deploy, or conceal malicious code',
      ],
      links: [
        {
          label: 'Security Policy',
          href: '/Policies/security-policy',
        },
      ],
    },
    {
      id: 'platform-integrity-and-resource-abuse',
      title: '8. Platform Integrity and Resource Abuse',
      body: [
        'You may not interfere with the normal operation of Aerealith AI or abuse shared infrastructure.',
        'Prohibited activity includes:',
      ],
      bullets: [
        'Excessive or abusive requests, jobs, automations, API calls, or workloads',
        'Circumventing quotas, rate limits, usage limits, plan limits, or billing controls',
        'Using multiple accounts to bypass limits',
        'Cryptomining or similar resource-intensive activity without written authorization',
        'Scraping, crawling, or bulk extraction that violates this policy, our Terms of Use, robots controls, or technical restrictions',
        'Reverse engineering, probing, or stress testing Aerealith AI systems without authorization',
        'Attempting to degrade model quality, overload queues, poison memory, corrupt analytics, or manipulate telemetry',
        'Uploading files or prompts designed to crash, overload, confuse, exploit, or evade Aerealith AI systems',
      ],
    },
    {
      id: 'ai-misuse',
      title: '9. AI Misuse',
      body: [
        'You may not use Aerealith AI to generate, transform, automate, or distribute content or actions that are deceptive, abusive, dangerous, or unlawful.',
        'Prohibited AI misuse includes:',
        'AI-generated outputs may be incomplete, inaccurate, or inappropriate for a particular use. You are responsible for reviewing and validating outputs before relying on them.',
        'Additional AI-specific rules may be provided in our AI Transparency Policy and Responsible AI Policy.',
      ],
      bullets: [
        'Generating fraud, scams, phishing messages, or deceptive impersonation content',
        'Creating fake evidence, forged records, false credentials, or fabricated official documents',
        'Creating deceptive deepfakes, synthetic identities, or misleading media without clear disclosure and consent',
        'Conducting harassment, stalking, threats, intimidation, or targeted abuse',
        'Generating or spreading deceptive political, civic, medical, financial, or emergency information',
        'Making automated decisions that materially affect a person’s rights, safety, employment, housing, education, credit, insurance, healthcare, legal status, or access to essential services without appropriate human review and legal authorization',
        'Inferring or targeting sensitive personal attributes without a lawful basis and appropriate consent',
        'Attempting to bypass Aerealith AI safety systems, policy enforcement, audit logging, or human approval controls',
        'Using Aerealith AI outputs as the sole source of truth for high-risk decisions',
      ],
      links: [
        {
          label: 'AI Transparency Policy',
          href: '/Policies/ai-transparency-policy',
        },
        {
          label: 'Responsible AI Policy',
          href: '/Policies/responsible-ai-policy',
        },
      ],
    },
    {
      id: 'automations-tools-and-connected-integrations',
      title: '10. Automations, Tools, and Connected Integrations',
      body: [
        'Aerealith AI may support automations, workflows, agents, tool calls, third-party integrations, infrastructure actions, IoT actions, and plugin-driven execution.',
        'You may only connect Aerealith AI to accounts, systems, services, networks, repositories, devices, environments, and data that you own or are authorized to use.',
        'You may not use Aerealith AI automations to:',
        'For high-impact or irreversible actions, you must use reasonable confirmation, rollback, logging, and review controls.',
      ],
      bullets: [
        'Access, modify, delete, or publish data without authorization',
        'Send spam, deceptive messages, or abusive communications',
        'Perform destructive actions without clear authorization and appropriate safeguards',
        'Bypass approval gates, change controls, security reviews, or enterprise restrictions',
        'Monitor, track, or surveil people without a lawful basis and appropriate consent',
        'Scrape, extract, or synchronize data in violation of third-party terms',
        'Trigger actions that violate laws, contracts, platform rules, or organizational policies',
        'Hide, disable, tamper with, or evade logs, alerts, monitoring, audit trails, or approval records',
      ],
    },
    {
      id: 'content-and-user-generated-material',
      title: '11. Content and User-Generated Material',
      body: [
        'You may not upload, create, request, store, share, publish, or distribute content that:',
        'User-generated content is also governed by our User-Generated Content Policy and Copyright Takedown Policy.',
      ],
      bullets: [
        'Violates another person’s intellectual property rights',
        'Violates privacy, publicity, confidentiality, or contractual rights',
        'Contains non-consensual intimate imagery',
        'Promotes self-harm, suicide, eating disorders, or dangerous behavior in a harmful way',
        'Contains threats, harassment, stalking, bullying, or targeted abuse',
        'Promotes hatred, dehumanization, or violence against protected groups',
        'Encourages terrorism, violent extremism, or organized violence',
        'Contains malware, exploit code, credential theft tools, or malicious instructions',
        'Is deceptive, fraudulent, defamatory, or unlawfully misleading',
        'Is designed to bypass safety systems, moderation systems, or platform restrictions',
      ],
      links: [
        {
          label: 'User-Generated Content Policy',
          href: '/Policies/user-generated-content-policy',
        },
        {
          label: 'Copyright Takedown Policy',
          href: '/Policies/copyright-takedown-policy',
        },
      ],
    },
    {
      id: 'intellectual-property-and-copyright',
      title: '12. Intellectual Property and Copyright',
      body: [
        'You may not use Aerealith AI to infringe, misappropriate, or violate intellectual property rights.',
        'You may not:',
        'Copyright complaints and takedown requests are handled under our Copyright Takedown Policy.',
      ],
      bullets: [
        'Upload, distribute, or generate unauthorized copies of copyrighted material',
        'Remove copyright notices, license terms, attribution, or provenance information',
        'Use Aerealith AI to bypass DRM, license checks, paywalls, access controls, or content protection systems',
        'Publish marketplace items, plugins, templates, personalities, prompts, dashboards, or workflows that include content you do not have rights to use',
        'Misrepresent ownership or licensing of generated or uploaded content',
      ],
      links: [
        {
          label: 'Copyright Takedown Policy',
          href: '/Policies/copyright-takedown-policy',
        },
      ],
    },
    {
      id: 'privacy-and-personal-data-abuse',
      title: '13. Privacy and Personal Data Abuse',
      body: [
        'You may not use Aerealith AI to violate privacy rights or misuse personal data.',
        'Prohibited activity includes:',
        'Personal data handling is governed by our Privacy Policy and Data Policy.',
      ],
      bullets: [
        'Uploading, processing, or sharing personal data without proper rights, authority, or consent',
        'Doxxing or publishing private personal information without consent',
        'Attempting to access another user’s private data, memory, files, analytics, messages, integrations, or logs',
        'Extracting secrets, credentials, tokens, personal data, or confidential information from Aerealith AI',
        'Creating or using tools that secretly collect, transmit, or sell personal data',
        'Tracking, profiling, or surveilling people without a lawful basis and appropriate notice',
        'Using personal data in a way that violates applicable privacy, employment, education, healthcare, financial, or consumer protection laws',
      ],
      links: [
        {
          label: 'Privacy Policy',
          href: '/Policies/privacy-policy',
        },
        {
          label: 'Data Policy',
          href: '/Policies/data-policy',
        },
      ],
    },
    {
      id: 'regulated-and-high-risk-use',
      title: '14. Regulated and High-Risk Use',
      body: [
        'You are responsible for determining whether your use of Aerealith AI is appropriate for your industry, jurisdiction, and risk level.',
        'Unless expressly authorized in a written agreement with SinLess Games LLC, you may not use Aerealith AI as the sole decision-maker for:',
        'Aerealith AI may assist with drafting, analysis, monitoring, summarization, planning, and workflow support, but qualified human review is required for high-risk or regulated decisions.',
      ],
      bullets: [
        'Medical diagnosis, treatment, emergency care, or clinical decisions',
        'Legal advice, legal representation, legal filing, or legal adjudication',
        'Financial advice, lending, credit, insurance, investment, or eligibility decisions',
        'Employment, hiring, firing, promotion, compensation, or disciplinary decisions',
        'Housing, education, benefits, immigration, public assistance, or essential service access',
        'Law enforcement, criminal justice, surveillance, biometric identification, or public safety decisions',
        'Safety-critical infrastructure, transportation, energy, industrial control, weapons, or emergency response systems',
      ],
    },
    {
      id: 'marketplace-plugins-and-developer-tools',
      title: '15. Marketplace, Plugins, and Developer Tools',
      body: [
        'If you create, publish, install, distribute, or use plugins, workflows, dashboards, personalities, templates, connectors, SDKs, automations, or marketplace items, you must follow this policy and all applicable developer rules.',
        'You may not create or distribute marketplace or developer items that:',
        'Organizations may approve, restrict, block, remove, or audit marketplace items according to their administrative controls and subscription terms.',
      ],
      bullets: [
        'Contain malware, spyware, credential stealers, or hidden backdoors',
        'Exfiltrate user data, secrets, files, memory, analytics, logs, or credentials',
        'Request permissions that are unnecessary, misleading, or excessive',
        'Hide network calls, tracking, telemetry, data transfers, or third-party dependencies',
        'Circumvent review, signing, sandboxing, permission prompts, or organization controls',
        'Misrepresent functionality, pricing, ownership, licensing, safety, or data use',
        'Abuse APIs, rate limits, billing systems, queues, compute, storage, or vector resources',
        'Violate third-party platform rules or terms',
        'Continue operating after being disabled, revoked, suspended, blocked, or removed',
      ],
    },
    {
      id: 'community-conduct',
      title: '16. Community Conduct',
      body: [
        'When using Aerealith AI community spaces, support channels, issue trackers, repositories, forums, Discord servers, marketplace review systems, documentation comments, or related spaces, you must act respectfully and in good faith.',
        'You may not:',
      ],
      bullets: [
        'Harass, threaten, intimidate, or abuse others',
        'Spam, flood, derail, or disrupt conversations',
        'Post hateful, discriminatory, or demeaning content',
        'Share private information without consent',
        'Impersonate staff, moderators, users, organizations, or systems',
        'Abuse reporting, review, appeal, or support systems',
        'Retaliate against users who report abuse or security concerns',
      ],
    },
    {
      id: 'self-hosted-and-air-gapped-deployments',
      title: '17. Self-Hosted and Air-Gapped Deployments',
      body: [
        'If you operate a self-hosted, hybrid, private, or air-gapped deployment of Aerealith AI, you are responsible for:',
        'Self-hosting Aerealith AI does not permit prohibited use, abuse, unlawful activity, license violations, or misuse of SinLess Games LLC intellectual property.',
      ],
      bullets: [
        'Securing your deployment',
        'Managing users, roles, permissions, and secrets',
        'Complying with applicable laws and contracts',
        'Configuring retention, audit, logging, backup, and monitoring controls',
        'Preventing misuse of your deployment',
        'Applying updates, patches, and security fixes',
        'Ensuring connected systems and integrations are authorized',
      ],
    },
    {
      id: 'enforcement',
      title: '18. Enforcement',
      body: [
        'We may investigate suspected violations of this policy.',
        'Depending on the severity, risk, and context, we may take one or more actions, including:',
        'We may act immediately and without prior notice when necessary to protect users, systems, data, Aerealith AI, SinLess Games LLC, third parties, or the public.',
      ],
      bullets: [
        'Warning the user or organization',
        'Requiring corrective action',
        'Removing, restricting, or disabling content',
        'Disabling plugins, integrations, automations, API keys, tokens, or marketplace items',
        'Throttling, limiting, or suspending usage',
        'Locking, suspending, or terminating accounts or workspaces',
        'Blocking access to specific features, models, tools, or integrations',
        'Notifying organization administrators',
        'Preserving relevant data where permitted or required',
        'Reporting unlawful or harmful activity to appropriate authorities',
        'Refusing future service',
      ],
    },
    {
      id: 'appeals',
      title: '19. Appeals',
      body: [
        'If you believe enforcement action was taken in error, you may request review by contacting us.',
        'Appeals should include:',
        'Submitting an appeal does not guarantee reinstatement, restoration, or reversal.',
      ],
      bullets: [
        'Your name or organization name',
        'The affected account, workspace, plugin, API key, automation, or content',
        'A clear explanation of why you believe the action was incorrect',
        'Any relevant evidence or context',
      ],
    },
    {
      id: 'reporting-abuse',
      title: '20. Reporting Abuse',
      body: [
        'Report suspected violations of this policy to:',
        'Before publishing this policy, confirm these email aliases exist and are monitored.',
        'When reporting abuse, include as much detail as possible, such as:',
      ],
      contacts: [
        {
          label: 'Abuse reports',
          email: 'abuse@sinlessgames.com',
          href: 'mailto:abuse@sinlessgames.com',
        },
        {
          label: 'Security concerns',
          email: 'security@sinlessgames.com',
          href: 'mailto:security@sinlessgames.com',
        },
        {
          label: 'Legal notices',
          email: 'legal@sinlessgames.com',
          href: 'mailto:legal@sinlessgames.com',
        },
        {
          label: 'General support',
          email: 'support@sinlessgames.com',
          href: 'mailto:support@sinlessgames.com',
        },
      ],
      bullets: [
        'Account, workspace, plugin, integration, automation, or content involved',
        'URLs, timestamps, logs, screenshots, or message IDs',
        'A description of the suspected violation',
        'Any immediate safety or security concerns',
      ],
    },
    {
      id: 'relationship-to-other-policies',
      title: '21. Relationship to Other Policies',
      body: [
        'This policy works together with other Aerealith AI policies, including:',
        'If there is a conflict between this policy and a written agreement signed by SinLess Games LLC, the written agreement controls only to the extent of that conflict.',
      ],
      links: [
        {
          label: 'Terms of Use',
          href: '/Policies/terms-of-use',
        },
        {
          label: 'Privacy Policy',
          href: '/Policies/privacy-policy',
        },
        {
          label: 'Data Policy',
          href: '/Policies/data-policy',
        },
        {
          label: 'Security Policy',
          href: '/Policies/security-policy',
        },
        {
          label: 'AI Transparency Policy',
          href: '/Policies/ai-transparency-policy',
        },
        {
          label: 'Responsible AI Policy',
          href: '/Policies/responsible-ai-policy',
        },
        {
          label: 'User-Generated Content Policy',
          href: '/Policies/user-generated-content-policy',
        },
        {
          label: 'Copyright Takedown Policy',
          href: '/Policies/copyright-takedown-policy',
        },
        {
          label: 'Underage Policy',
          href: '/Policies/underage-policy',
        },
        {
          label: 'Support Policy',
          href: '/Policies/support-policy',
        },
        {
          label: 'Subprocessor Vendor List',
          href: '/Policies/subprocessor-vendor-list',
        },
      ],
    },
    {
      id: 'changes-to-this-policy',
      title: '22. Changes to This Policy',
      body: [
        'We may update this policy from time to time.',
        'When we make material changes, we will update the last_updated date and may provide notice through the service, documentation, email, release notes, or another reasonable method.',
        'Continued use of Aerealith AI after changes become effective means you accept the updated policy.',
      ],
    },
    {
      id: 'contact',
      title: '23. Contact',
      body: ['Questions about this policy may be sent to:'],
      contacts: [
        {
          label: 'Legal',
          email: 'legal@sinlessgames.com',
          href: 'mailto:legal@sinlessgames.com',
        },
      ],
    },
  ],
} satisfies PolicyDocument;

export default acceptableUsePolicy;
