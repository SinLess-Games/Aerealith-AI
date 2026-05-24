import type { ContactOption } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Default background color used by contact option cards.
 *
 * @public
 * @constant
 * @readonly
 * @decorator color
 */
const DEFAULT_CONTACT_CARD_BG = '#143256';

/**
 * Main heading for the Contact page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator content
 */
export const ContactHeader = 'Contact Aerealith AI';

/**
 * Main descriptive copy for the Contact page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator content
 */
export const ContactDescription =
  'Have a question, idea, bug report, or support request? Choose the option below that best fits what you need. You can connect with the Aerealith AI team, join the community, share feedback, request new features, report issues, or follow the public build on Patreon. Every message helps improve the platform, refine the roadmap, and shape Aerealith AI into a more useful, secure, transparent, and user-focused assistant.';

/**
 * Primary Contact page image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/contact/contact-us.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const ContactImage = `${Image_Paths.pages.contact}/contact-us.png` as const;

/**
 * Contact page action cards.
 *
 * Images are loaded from:
 *
 * apps/frontend/public/images/pages/contact
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const contactOptions = [
  {
    title: 'Join Our Discord',
    description:
      'Join the Aerealith AI community to follow development, ask questions, share ideas, discuss features, and connect with other early users and supporters.',
    href: 'https://discord.gg/Za8MVstYnr',
    buttonText: 'Join Discord',
    image: `${Image_Paths.pages.contact}/discord.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Email Support',
    description:
      'Contact the support team for account questions, billing concerns, access issues, platform help, partnership inquiries, or anything that needs a direct response.',
    href: 'mailto:support@aerealith.ai',
    buttonText: 'Send Email',
    image: `${Image_Paths.pages.contact}/email.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Follow Us on Patreon',
    description:
      'Follow the Aerealith AI build on Patreon for development updates, roadmap notes, design previews, behind-the-scenes progress, and early project announcements.',
    href: 'https://patreon.com/HelixAI',
    buttonText: 'View Patreon',
    image: `${Image_Paths.pages.contact}/patreon.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Request a Feature',
    description:
      'Have an idea that would make Aerealith AI more useful? Submit a feature request through GitHub and help shape future workflows, integrations, automation, and platform capabilities.',
    href: 'https://github.com/SinLess-Games/Aerealith-AI/issues/new/choose',
    buttonText: 'Submit Request',
    image: `${Image_Paths.pages.contact}/feature.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Report a Bug',
    description:
      'Found something broken, confusing, or not working as expected? Open a bug report so the issue can be tracked, investigated, prioritized, and fixed.',
    href: 'https://github.com/SinLess-Games/Aerealith-AI/issues/new/choose',
    buttonText: 'Report Bug',
    image: `${Image_Paths.pages.contact}/bug.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
  {
    title: 'Give Feedback',
    description:
      'Share thoughts on the user experience, documentation, pricing, features, integrations, trust model, or overall platform direction. Feedback helps guide better product decisions.',
    href: 'https://docs.google.com/forms/d/e/1FAIpQLSd8dEXyqvkMrkt4YOHqTwYw620qBXbT3R9MnWjDHEdOeX4EnA/viewform?usp=sharing',
    buttonText: 'Leave Feedback',
    image: `${Image_Paths.pages.contact}/feedback.png`,
    bgColor: DEFAULT_CONTACT_CARD_BG,
  },
] as const satisfies readonly ContactOption[];

/**
 * Uppercase alias for contact options.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const CONTACT_OPTIONS = contactOptions;