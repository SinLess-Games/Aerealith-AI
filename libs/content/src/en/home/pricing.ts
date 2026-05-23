// libs/content/src/en/home/pricing.ts

import type { ContentImageItem } from '../../types';

export type PricingPreviewImageContent = {
  src: string;
  alt: string;
};

export type PricingPreviewSectionContent = {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  body?: string;
  footnote?: string;
  image?: PricingPreviewImageContent;

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  descriptionMaxWidth?: number | string;
  bodyMaxWidth?: number | string;
  mediaMaxWidth?: number | string;
  mediaPosition?: 'left' | 'right' | 'top' | 'bottom';
  centerContent?: boolean;
};

export const pricingPreviewImage = {
  id: 'helix-ai-pricing-preview',
  type: 'image',
  src: '/images/Pricing.png',
  alt: 'Helix AI pricing tiers and plan comparison',
  title: 'Helix AI Pricing Preview',
  priority: false,
} as const satisfies ContentImageItem;

export const pricingPreviewDescription =
  'Helix AI is planned with simple, transparent tiers so users can start free, explore the platform, and upgrade only when they need more capability. The goal is to make the pricing easy to understand while still giving room for different types of users: individuals who want a smarter assistant, creators and communities that need automation and engagement tools, developers who want integrations and extensibility, teams that need collaboration and analytics, and organizations that require stronger governance, self-hosting, or enterprise deployment options. As the MVP ships and real usage data becomes available, pricing will continue to be refined around actual infrastructure costs, AI model usage, support needs, feature limits, and customer feedback. Each tier is intended to grow with the user, offering a clear path from early experimentation to advanced workflows, professional use, business operations, and long-term enterprise readiness.';

export const pricingPreviewSection = {
  id: 'pricing-preview',
  eyebrow: 'Plans & Pricing',
  title: 'Pricing Preview',
  description:
    'Start with the core features you need today, then scale into more advanced capabilities as your workflow grows. Helix AI is designed to meet users where they are, whether they are exploring the platform for the first time, organizing personal tasks, managing a community, building developer workflows, or preparing for team and enterprise use. As your needs expand, you can unlock deeper memory, stronger automation, more integrations, richer analytics, higher usage limits, and more advanced support without having to switch platforms or rebuild your workflow from scratch.',
  body: pricingPreviewDescription,

  maxWidth: 1900,
  copyMaxWidth: '80%',
  descriptionMaxWidth: '80%',
  bodyMaxWidth: '80%',
  mediaMaxWidth: '100%',
  mediaPosition: 'bottom',
  centerContent: true,

  image: {
    src: pricingPreviewImage.src,
    alt: pricingPreviewImage.alt,
  },
} as const satisfies PricingPreviewSectionContent;

/**
 * Backwards-compatible uppercase exports.
 *
 * Prefer camelCase exports for new imports.
 */
export const PRICING_IMAGE = pricingPreviewImage;
export const PRICING_PREVIEW_DESCRIPTION = pricingPreviewDescription;
export const PRICING_PREVIEW_SECTION = pricingPreviewSection;