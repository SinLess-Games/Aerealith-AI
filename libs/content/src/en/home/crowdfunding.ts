// libs/content/src/en/home/crowdfunding.ts

/**
 * Crowdfunding video content item.
 *
 * @public
 * @type
 * @decorator content
 */
export type CrowdfundingVideoContent = {
  id?: string;
  title?: string;
  description?: string;
  src: string;
  poster?: string;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
};

/**
 * Crowdfunding section content configuration.
 *
 * @public
 * @type
 * @decorator section
 */
export type CrowdfundingSectionContent = {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  body?: string;
  footnote?: string;
  videos?: readonly CrowdfundingVideoContent[];
};

/**
 * Default video playback options used by crowdfunding videos.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const crowdfundingVideoBaseOptions = {
  controls: true,
  muted: false,
  loop: false,
  autoPlay: false,
  playsInline: true,
  preload: 'metadata',
} as const satisfies Partial<CrowdfundingVideoContent>;

/**
 * Crowdfunding and investor-support videos.
 *
 * CDN video URLs may still point to the existing Cloudinary account/folder
 * until the media library is renamed or migrated.
 *
 * @public
 * @constant
 * @readonly
 * @decorator media
 */
export const crowdfundingVideos = [
  {
    id: 'aerealith-ai-investor-call',
    title: 'A Call to Investors',
    description:
      'A short investor-focused overview introducing Aerealith AI as a secure, extensible command center for automation, analytics, integrations, memory, and digital workflow intelligence.',
    src: 'https://res.cloudinary.com/helix-ai/video/upload/v1779161862/Helix_AI_Investor_wvztbl.mp4',
    ...crowdfundingVideoBaseOptions,
  },

  /**
   * Add more CDN videos here.
   *
   * Example:
   * {
   *   id: 'aerealith-ai-founder-update-001',
   *   title: 'Founder Update 001',
   *   description:
   *     'A short update covering MVP progress, roadmap priorities, and funding goals.',
   *   src: 'https://cdn.example.com/aerealith-ai/videos/founder-update-001.mp4',
   *   ...crowdfundingVideoBaseOptions,
   * },
   */
] as const satisfies readonly CrowdfundingVideoContent[];

/**
 * Crowdfunding section long-form description.
 *
 * @public
 * @constant
 * @readonly
 * @decorator content
 */
export const crowdfundingDescription =
  'Aerealith AI is being built as a long-term platform, not a quick chatbot wrapper. Crowdfunding, aligned investor support, and early community backing help fund the infrastructure, engineering, security, design, integrations, documentation, and production systems needed to turn Aerealith AI into a reliable command center for users, creators, developers, communities, teams, and organizations.';

/**
 * Crowdfunding section content.
 *
 * @public
 * @constant
 * @readonly
 * @decorator section
 */
export const crowdfundingSection = {
  id: 'crowdfunding',
  eyebrow: 'Community Funding',
  title: 'Help Build Aerealith AI',
  description:
    'Support the infrastructure, engineering, security, design, integrations, documentation, and production systems needed to bring Aerealith AI to life.',
  body: crowdfundingDescription,
  videos: crowdfundingVideos,
} as const satisfies CrowdfundingSectionContent;

/**
 * Legacy carousel-compatible media objects.
 *
 * Prefer `crowdfundingVideos` for the new CrowdfundingSection component.
 *
 * @public
 * @constant
 * @readonly
 * @decorator media
 */
export const crowdfundingMediaItems = crowdfundingVideos.map((video) => ({
  ...video,
  type: 'video' as const,
}));

/**
 * Backwards-compatible uppercase exports.
 *
 * Prefer camelCase exports for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const CROWDFUNDING_VIDEO_BASE_OPTIONS = crowdfundingVideoBaseOptions;
export const CROWDFUNDING_VIDEOS = crowdfundingVideos;
export const CROWDFUNDING_MEDIA_ITEMS = crowdfundingMediaItems;
export const CROWDFUNDING_DESCRIPTION = crowdfundingDescription;
export const CROWDFUNDING_SECTION = crowdfundingSection;