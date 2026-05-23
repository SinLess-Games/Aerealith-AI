import type { ContactOption } from '../../types';

const DEFAULT_CONTACT_CARD_BG = '#143256';

export const ContactHeader = 'Contact Helix AI';

export const ContactDescription =
  'Have a question, idea, bug report, or support request? Choose the option below that best fits what you need. You can connect with the Helix AI team, join the community, share feedback, request new features, report issues, or follow the public build on Patreon. Every message helps improve the platform, refine the roadmap, and shape Helix AI into a more useful, secure, transparent, and user-focused assistant.';

export const contactOptions = [
  {
    title: 'Join Our Discord',
    description:
      'Join the Helix AI community to follow development, ask questions, share ideas, discuss features, and connect with other early users and supporters.',
    href: 'https://discord.gg/Za8MVstYnr',
    buttonText: 'Join Discord',
    image: '/images/contact/discord.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Email Support',
    description:
      'Contact the support team for account questions, billing concerns, access issues, platform help, partnership inquiries, or anything that needs a direct response.',
    href: 'mailto:support@helixaibot.com',
    buttonText: 'Send Email',
    image: '/images/contact/email.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Follow Us on Patreon',
    description:
      'Follow the Helix AI build on Patreon for development updates, roadmap notes, design previews, behind-the-scenes progress, and early project announcements.',
    href: 'https://patreon.com/HelixAI',
    buttonText: 'View Patreon',
    image: '/images/contact/patreon.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Request a Feature',
    description:
      'Have an idea that would make Helix AI more useful? Submit a feature request through GitHub and help shape future workflows, integrations, automation, and platform capabilities.',
    href: 'https://github.com/SinLess-Games/Helix/issues/new/choose',
    buttonText: 'Submit Request',
    image: '/images/contact/feature.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Report a Bug',
    description:
      'Found something broken, confusing, or not working as expected? Open a bug report so the issue can be tracked, investigated, prioritized, and fixed.',
    href: 'https://github.com/SinLess-Games/Helix/issues/new/choose',
    buttonText: 'Report Bug',
    image: '/images/contact/bug.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Give Feedback',
    description:
      'Share thoughts on the user experience, documentation, pricing, features, integrations, trust model, or overall platform direction. Feedback helps guide better product decisions.',
    href: 'https://docs.google.com/forms/d/e/1FAIpQLSd8dEXyqvkMrkt4YOHqTwYw620qBXbT3R9MnWjDHEdOeX4EnA/viewform?usp=sharing',
    buttonText: 'Leave Feedback',
    image: '/images/contact/feedback.png',
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
] as const satisfies readonly ContactOption[];

export const CONTACT_OPTIONS = contactOptions;