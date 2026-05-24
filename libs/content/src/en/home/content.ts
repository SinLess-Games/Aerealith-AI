// libs/content/src/en/home/content.ts

import type { ReactElement } from 'react';
import { createElement } from 'react';

import { Box, Stack, Typography } from '@mui/material';

import {
  CrowdfundingSection,
  FeatureGrid,
  MarketingSection,
  MediaCarousel,
  MediaImage,
  PricingPreviewSection,
} from '@aerealith-ai/ui';

import { Image_Paths } from '../constants/images';
import { crowdfundingSection } from './crowdfunding';
import { aerealithDifferentiators, differentSection } from './different';
import { faqCards, faqSection, type FaqCardItem } from './faq';
import { pricingPreviewSection } from './pricing';

/**
 * Home page hero data.
 *
 * @public
 * @constant
 * @readonly
 * @decorator content
 */
export const HERO_DATA = {
  title: 'Aerealith AI — Your Digital Life, Intelligently Connected',
  subtitle:
    'Aerealith AI is a secure virtual assistant designed to bring your digital life into one intelligent command center. It goes beyond basic voice commands by connecting your apps, organizing your data, automating repetitive tasks, monitoring important systems, and turning scattered information into clear, actionable insight. Built for work, home, creators, developers, and infrastructure operators, Aerealith AI helps you ask better questions, manage complex workflows, track what matters, and stay in control across the tools and platforms you rely on every day.',
  imageUrl: `${Image_Paths.marketing.hero}/hero-1.png`,
  imageAlt: 'Aerealith AI futuristic hero artwork',
} as const;

/**
 * Investor video metadata.
 *
 * @public
 * @constant
 * @readonly
 * @decorator media
 */
export const INVESTOR_VIDEO = {
  id: 'aerealith-ai-investor-video',
  src: 'Helix_AI_Investor_wvztbl',
  title: 'A Call to Investors',
  eyebrow: 'Investor Opportunity',
  body: 'Aerealith AI is being built as more than another assistant. It is a secure, extensible command center for modern digital life, designed to connect apps, automate workflows, organize knowledge, monitor systems, and turn scattered data into usable insight. We are looking for aligned investors who understand the long-term opportunity in user-owned AI, private automation, infrastructure intelligence, and trusted digital companions.',
} as const;

/**
 * Rendered Home page sections.
 *
 * Metadata intentionally lives outside this file.
 *
 * @public
 * @interface
 * @decorator page
 */
export interface SectionsProps {
  pageTitle: string;
  sections: readonly ReactElement[];
}

/**
 * Public path for marketing feature images used by the overview carousel.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const INFOGRAPHICS_PUBLIC_PATH = Image_Paths.marketing.features;

/**
 * Public path for Home page product preview images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const PRODUCT_PREVIEW_PATH = Image_Paths.pages.home.productPreview;

/**
 * Public path for Home page trust and privacy principle images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const PRINCIPLES_PATH = Image_Paths.pages.home.principles;

/**
 * Public path for Home page section images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const HOME_PAGE_IMAGE_PATH = Image_Paths.pages.home.root;

/**
 * Maximum number of media files to scan when using auto-discovery.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const DEFAULT_MEDIA_MAX_SCAN_COUNT = 100;

/**
 * First media index to scan when using indexed media filenames.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const DEFAULT_MEDIA_START_INDEX = 1;

/**
 * Number of missing indexed files allowed before stopping media discovery.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const DEFAULT_MEDIA_STOP_AFTER_MISSES = 1;

const brandAccentColor = 'var(--aerealith-pink, var(--helix-pink, #ff1493))';

const titleSx = {
  color: brandAccentColor,
} as const;

const pricingTitleSx = {
  color: brandAccentColor,
  textShadow:
    '0 0 12px rgba(255, 20, 147, 0.34), 0 0 28px rgba(246, 6, 111, 0.18)',
} as const;

const differentiatorCardHoverSx = {
  '& .MuiCard-root, & [class*="MuiCard-root"]': {
    transition:
      'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease',
  },

  '&:hover .MuiCard-root, &:hover [class*="MuiCard-root"], & .MuiCard-root:hover, & [class*="MuiCard-root"]:hover':
    {
      borderColor: 'rgba(246, 6, 111, 0.78) !important',
      boxShadow:
        '0 0 34px rgba(246, 6, 111, 0.36), 0 22px 70px rgba(0, 0, 0, 0.42) !important',
      transform: 'translateY(-3px)',
    },

  '&:hover h3, & .MuiCard-root:hover h3, & [class*="MuiCard-root"]:hover h3':
    {
      color: `${brandAccentColor} !important`,
      textShadow: '0 0 18px rgba(246, 6, 111, 0.35)',
    },
} as const;

const pricingSectionSx = {
  width: '100%',
  maxWidth: '100%',
  mx: 'auto',
  overflowX: 'hidden',

  '& .MuiContainer-root': {
    width: '100% !important',
    maxWidth: '1900px !important',
    mx: 'auto',
    px: {
      xs: 2,
      sm: 3,
      md: 4,
      lg: 5,
      xl: 6,
    },
  },

  '& h2': {
    color: `${brandAccentColor} !important`,
    textShadow:
      '0 0 12px rgba(255, 20, 147, 0.34), 0 0 28px rgba(246, 6, 111, 0.18)',
  },

  '& p': {
    maxWidth: '1120px !important',
    mx: 'auto',
  },
} as const;

const carouselCardSlotProps = {
  card: {
    sx: {
      width: '100%',
      height: '100%',
      minHeight: {
        xs: 430,
        sm: 500,
        md: 560,
        lg: 560,
        xl: 610,
      },

      '& .helix-media-carousel-card-content': {
        minHeight: {
          xs: 148,
          sm: 140,
          md: 132,
          lg: 132,
          xl: 132,
        },
        display: 'grid',
        alignContent: 'start',
      },
    },
  },

  viewport: {
    sx: {
      aspectRatio: '16 / 9',
      bgcolor: 'rgba(0, 0, 0, 0.82)',
    },
  },

  media: {
    sx: {
      bgcolor: 'rgba(0, 0, 0, 0.82)',
    },
  },

  caption: {
    sx: {
      minHeight: {
        xs: 84,
        sm: 78,
        md: 72,
      },

      '& h3': {
        display: '-webkit-box',
        WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },

      '& p': {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
    },
  },
} as const;

const marketingFeatureCarouselItems = [
  {
    id: 'feature-ai-chat-companion',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/ai-chat-companion.png`,
    alt: 'Aerealith AI chat companion feature',
    title: 'AI Chat Companion',
  },
  {
    id: 'feature-air-gapped-ready',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/air-gapped-ready.png`,
    alt: 'Aerealith AI air-gapped ready feature',
    title: 'Air-Gapped Ready',
  },
  {
    id: 'feature-analytics-dashboard',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/analytics-dashboard.png`,
    alt: 'Aerealith AI analytics dashboard feature',
    title: 'Analytics Dashboard',
  },
  {
    id: 'feature-audit-and-activity-logs',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/audit-and-activity-logs.png`,
    alt: 'Aerealith AI audit and activity logs feature',
    title: 'Audit and Activity Logs',
  },
  {
    id: 'feature-automation-approvals',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/automation-approvals.png`,
    alt: 'Aerealith AI automation approvals feature',
    title: 'Automation Approvals',
  },
  {
    id: 'feature-community-management',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/community-management.png`,
    alt: 'Aerealith AI community management feature',
    title: 'Community Management',
  },
  {
    id: 'feature-connected-app-integrations',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/connected-app-integrations.png`,
    alt: 'Aerealith AI connected app integrations feature',
    title: 'Connected App Integrations',
  },
  {
    id: 'feature-connected-apps',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/connected-apps.png`,
    alt: 'Aerealith AI connected apps feature',
    title: 'Connected Apps',
  },
  {
    id: 'feature-custom-personas',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/custom-personas.png`,
    alt: 'Aerealith AI custom personas feature',
    title: 'Custom Personas',
  },
  {
    id: 'feature-developer-tooling',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/developer-tooling.png`,
    alt: 'Aerealith AI developer tooling feature',
    title: 'Developer Tooling',
  },
  {
    id: 'feature-discord-assistant',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/discord-assistant.png`,
    alt: 'Aerealith AI Discord assistant feature',
    title: 'Discord Assistant',
  },
  {
    id: 'feature-infrastructure-monitoring',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/infrastructure-monitoring.png`,
    alt: 'Aerealith AI infrastructure monitoring feature',
    title: 'Infrastructure Monitoring',
  },
  {
    id: 'feature-knowledge-and-file-context',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/knowledge-and-file-context.png`,
    alt: 'Aerealith AI knowledge and file context feature',
    title: 'Knowledge and File Context',
  },
  {
    id: 'feature-marketplace-plugins',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/marketplace-plugins.png`,
    alt: 'Aerealith AI marketplace plugins feature',
    title: 'Marketplace Plugins',
  },
  {
    id: 'feature-multi-platform-assistant',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/multi-platform-assistant.png`,
    alt: 'Aerealith AI multi-platform assistant feature',
    title: 'Multi-Platform Assistant',
  },
  {
    id: 'feature-permissioned-memory',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/permissioned-memory.png`,
    alt: 'Aerealith AI permissioned memory feature',
    title: 'Permissioned Memory',
  },
  {
    id: 'feature-privacy-first-controls',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/privacy-first-controls.png`,
    alt: 'Aerealith AI privacy-first controls feature',
    title: 'Privacy-First Controls',
  },
  {
    id: 'feature-roadmap-and-progress-tracking',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/roadmap-and-progress-tracking.png`,
    alt: 'Aerealith AI roadmap and progress tracking feature',
    title: 'Roadmap and Progress Tracking',
  },
  {
    id: 'feature-secure-digital-command-center',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/secure-digital-command-center.png`,
    alt: 'Aerealith AI secure digital command center feature',
    title: 'Secure Digital Command Center',
  },
  {
    id: 'feature-self-hosted-deployments',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/self-hosted-deployments.png`,
    alt: 'Aerealith AI self-hosted deployments feature',
    title: 'Self-Hosted Deployments',
  },
  {
    id: 'feature-smart-notifications',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/smart-notifications.png`,
    alt: 'Aerealith AI smart notifications feature',
    title: 'Smart Notifications',
  },
  {
    id: 'feature-task-and-project-context',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/task-and-project-context.png`,
    alt: 'Aerealith AI task and project context feature',
    title: 'Task and Project Context',
  },
  {
    id: 'feature-team-workspaces',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/team-workspaces.png`,
    alt: 'Aerealith AI team workspaces feature',
    title: 'Team Workspaces',
  },
  {
    id: 'feature-transparent-automations',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/transparent-automations.png`,
    alt: 'Aerealith AI transparent automations feature',
    title: 'Transparent Automations',
  },
  {
    id: 'feature-user-owned-data',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/user-owned-data.png`,
    alt: 'Aerealith AI user-owned data feature',
    title: 'User-Owned Data',
  },
  {
    id: 'feature-workflow-orchestration',
    type: 'image' as const,
    src: `${INFOGRAPHICS_PUBLIC_PATH}/workflow-orchestration.png`,
    alt: 'Aerealith AI workflow orchestration feature',
    title: 'Workflow Orchestration',
  },
] as const;

const principleCarouselItems = [
  {
    id: 'principle-access-control',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/access-control.png`,
    alt: 'Aerealith AI access control principle',
    title: 'Access Control',
  },
  {
    id: 'principle-auditable-activity-and-actions',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/auditable-activity-and-actions.png`,
    alt: 'Aerealith AI auditable activity and actions principle',
    title: 'Auditable Activity and Actions',
  },
  {
    id: 'principle-clear-user-consent',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/clear-user-consent.png`,
    alt: 'Aerealith AI clear user consent principle',
    title: 'Clear User Consent',
  },
  {
    id: 'principle-data-deletion',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/data-deletion.png`,
    alt: 'Aerealith AI data deletion principle',
    title: 'Data Deletion',
  },
  {
    id: 'principle-data-exports',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/data-exports.png`,
    alt: 'Aerealith AI data exports principle',
    title: 'Data Exports',
  },
  {
    id: 'principle-encrypted-everywhere',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/encrypted-everywhere.png`,
    alt: 'Aerealith AI encrypted everywhere principle',
    title: 'Encrypted Everywhere',
  },
  {
    id: 'principle-human-control',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/human-control.png`,
    alt: 'Aerealith AI human control principle',
    title: 'Human Control',
  },
  {
    id: 'principle-no-selling',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/no-selling.png`,
    alt: 'Aerealith AI no selling user data principle',
    title: 'No Selling User Data',
  },
  {
    id: 'principle-no-unrestricted-background-control',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/no-unrestricted-background-control.png`,
    alt: 'Aerealith AI no unrestricted background control principle',
    title: 'No Unrestricted Background Control',
  },
  {
    id: 'principle-permissioned-memory',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/permissioned-memory.png`,
    alt: 'Aerealith AI permissioned memory principle',
    title: 'Permissioned Memory',
  },
  {
    id: 'principle-privacy-ensured',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/privacy-ensured.png`,
    alt: 'Aerealith AI privacy ensured principle',
    title: 'Privacy Ensured',
  },
  {
    id: 'principle-responsible-ai',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/responsible-ai.png`,
    alt: 'Aerealith AI responsible AI principle',
    title: 'Responsible AI',
  },
  {
    id: 'principle-scoped-app-access',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/scoped-app-access.png`,
    alt: 'Aerealith AI scoped app access principle',
    title: 'Scoped App Access',
  },
  {
    id: 'principle-secure-infrastructure',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/secure-infrastructure.png`,
    alt: 'Aerealith AI secure infrastructure principle',
    title: 'Secure Infrastructure',
  },
  {
    id: 'principle-sensitive-data-minimization',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/sensitive-data-minimization.png`,
    alt: 'Aerealith AI sensitive data minimization principle',
    title: 'Sensitive Data Minimization',
  },
  {
    id: 'principle-separation-by-design',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/seperation-by-design.png`,
    alt: 'Aerealith AI separation by design principle',
    title: 'Separation by Design',
  },
  {
    id: 'principle-transparency',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/transparency.png`,
    alt: 'Aerealith AI transparency principle',
    title: 'Transparency',
  },
  {
    id: 'principle-transparent-automations',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/transparent-automations.png`,
    alt: 'Aerealith AI transparent automations principle',
    title: 'Transparent Automations',
  },
  {
    id: 'principle-user-controlled-data',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/user-controlled-data.png`,
    alt: 'Aerealith AI user-controlled data principle',
    title: 'User-Controlled Data',
  },
  {
    id: 'principle-user-controlled-memory',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/user-controlled-memory.png`,
    alt: 'Aerealith AI user-controlled memory principle',
    title: 'User-Controlled Memory',
  },
  {
    id: 'principle-what-it-can-and-cannot-do',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/what-it-can-and-cannot-do.png`,
    alt: 'Aerealith AI what it can and cannot do principle',
    title: 'What It Can and Cannot Do',
  },
] as const;

function builtForImage(): ReactElement {
  return createElement(MediaImage, {
    src: `${HOME_PAGE_IMAGE_PATH}/built-for.png`,
    alt: 'Aerealith AI built for developers, creators, teams, infrastructure operators, and digital workflows',
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
  });
}

function howItWorksImage(): ReactElement {
  return createElement(MediaImage, {
    src: `${HOME_PAGE_IMAGE_PATH}/how-it-works.png`,
    alt: 'Aerealith AI how it works illustration',
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
  });
}

function infographicsCarousel(): ReactElement {
  return createElement(MediaCarousel, {
    items: marketingFeatureCarouselItems,

    autoScroll: true,
    autoScrollInterval: 6500,
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnVideoPlay: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: true,
    showCaptions: true,
    showFullscreenButton: true,
    fullscreen: true,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
    imageSizes: '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px',
  });
}

function productPreviewCarousel(): ReactElement {
  return createElement(MediaCarousel, {
    autoDiscoverImages: true,
    imageBasePath: PRODUCT_PREVIEW_PATH,
    imageFilePrefix: 'preview-',
    imageExtension: 'png',
    startIndex: DEFAULT_MEDIA_START_INDEX,
    maxImages: DEFAULT_MEDIA_MAX_SCAN_COUNT,
    stopAfterMisses: DEFAULT_MEDIA_STOP_AFTER_MISSES,
    imageAltPrefix: 'Aerealith AI product preview',
    imageTitlePrefix: 'Product Preview',

    cdnVideos: [
      {
        id: 'aerealith-ai-notebooklm-brief',
        title: 'Aerealith AI Command Center Brief',
        description:
          'A short NotebookLM-generated audio/video brief introducing the Aerealith AI command center concept, including its role as a secure hub for apps, data, workflows, automation, and intelligent digital operations.',
        src: 'https://res.cloudinary.com/helix-ai/video/upload/v1779241381/Helix_AI__Command_Center_kyjch9.mp4',
        controls: true,
        muted: false,
        loop: false,
        autoPlay: false,
        playsInline: true,
        preload: 'metadata',
      },
    ],

    autoScroll: true,
    autoScrollInterval: 6500,
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnVideoPlay: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: true,
    showCaptions: true,
    showFullscreenButton: true,
    fullscreen: true,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
    imageSizes: '(max-width: 768px) 100vw, (max-width: 1200px) 48vw, 860px',
    slotProps: carouselCardSlotProps,
  });
}

function principlesCarousel(): ReactElement {
  return createElement(MediaCarousel, {
    items: principleCarouselItems,

    autoScroll: true,
    autoScrollInterval: 6500,
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnVideoPlay: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: true,
    showCaptions: true,
    showFullscreenButton: true,
    fullscreen: true,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
    imageSizes: '(max-width: 768px) 100vw, (max-width: 1200px) 48vw, 860px',
    slotProps: carouselCardSlotProps,
  });
}

function faqCard(card: FaqCardItem): ReactElement {
  return createElement(
    Box,
    {
      sx: {
        position: 'relative',
        width: '100%',
        maxWidth: {
          xs: '100%',
          sm: 520,
          md: 540,
          lg: 560,
        },
        minHeight: {
          xs: 390,
          sm: 430,
          md: 470,
          lg: 500,
        },
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 4,
        border: '1px solid rgba(255, 255, 255, 0.14)',
        background:
          'linear-gradient(135deg, rgba(3, 13, 32, 0.88), rgba(25, 18, 58, 0.82), rgba(45, 13, 55, 0.76))',
        boxShadow:
          '0 24px 90px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        p: {
          xs: 3,
          sm: 3.5,
          md: 4,
        },
        pb: {
          xs: 8,
          sm: 8.5,
          md: 9,
        },
        transition:
          'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',

        '&:hover': {
          borderColor: 'rgba(246, 6, 111, 0.72)',
          boxShadow:
            '0 0 34px rgba(246, 6, 111, 0.28), 0 24px 90px rgba(0, 0, 0, 0.46)',
          transform: 'translateY(-3px)',
        },
      },
    },
    createElement(
      Stack,
      {
        spacing: {
          xs: 2,
          md: 2.5,
        },
        sx: {
          height: '100%',
        },
      },
      createElement(
        Typography,
        {
          variant: 'h4',
          sx: {
            color: 'text.primary',
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            fontSize: {
              xs: '1.65rem',
              sm: '1.9rem',
              md: '2.15rem',
            },
          },
        },
        card.title,
      ),
      createElement(
        Typography,
        {
          variant: 'body1',
          sx: {
            color: 'text.secondary',
            fontSize: {
              xs: '0.98rem',
              md: '1.04rem',
            },
            lineHeight: 1.8,
          },
        },
        card.description,
      ),
    ),
    createElement(
      Box,
      {
        sx: {
          position: 'absolute',
          right: {
            xs: 24,
            sm: 28,
            md: 32,
          },
          bottom: {
            xs: 24,
            sm: 28,
            md: 32,
          },
        },
      },
      createElement(
        Box,
        {
          sx: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            border: '1px solid rgba(0, 219, 255, 0.28)',
            bgcolor: 'rgba(0, 219, 255, 0.08)',
            color: 'rgba(160, 238, 255, 0.94)',
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            lineHeight: 1,
            px: 1.4,
            py: 0.9,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          },
        },
        card.tag,
      ),
    ),
  );
}

function faqCarousel(): ReactElement {
  return createElement(MediaCarousel, {
    items: faqCards.map((card, index) => ({
      id: `faq-card-${index + 1}`,
      type: 'custom' as const,
      ariaLabel: card.question,
      content: faqCard(card),
    })),

    autoScroll: faqSection.carousel.autoScroll,
    autoScrollInterval: faqSection.carousel.autoScrollInterval,
    pauseOnHover: faqSection.carousel.pauseOnHover,
    pauseOnFocus: faqSection.carousel.pauseOnFocus,
    loop: faqSection.carousel.loop,
    showArrows: faqSection.carousel.showArrows,
    showPagination: faqSection.carousel.showPagination,
    showProgress: faqSection.carousel.showProgress,
    showCaptions: false,
    showFullscreenButton: false,
    fullscreen: false,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: false,
    bordered: false,
    elevated: false,
    imageSizes: '100vw',

    slotProps: {
      card: {
        sx: {
          width: '100%',
          maxWidth: {
            xs: '100%',
            sm: 620,
            md: 640,
            lg: 660,
          },
          mx: 'auto',
          bgcolor: 'transparent',
          border: 0,
          boxShadow: 'none',
        },
      },
      viewport: {
        sx: {
          width: '100%',
          maxWidth: {
            xs: '100%',
            sm: 620,
            md: 640,
            lg: 660,
          },
          minHeight: {
            xs: 500,
            sm: 530,
            md: 560,
            lg: 590,
          },
          mx: 'auto',
          aspectRatio: 'auto',
          bgcolor: 'transparent',
        },
      },
      slide: {
        sx: {
          display: 'grid',
          placeItems: 'center',
          p: {
            xs: 0,
            sm: 0.5,
            md: 1,
          },
        },
      },
      media: {
        sx: {
          width: '100%',
          maxWidth: {
            xs: '100%',
            sm: 620,
            md: 640,
            lg: 660,
          },
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          mx: 'auto',
          bgcolor: 'transparent',
        },
      },
      arrows: {
        sx: {
          insetInline: {
            xs: -4,
            md: -8,
          },
        },
      },
      pagination: {
        sx: {
          mt: 2,
        },
      },
      paginationDot: {
        sx: {
          '&[aria-current="true"]': {
            bgcolor: brandAccentColor,
            boxShadow: '0 0 18px rgba(246, 6, 111, 0.55)',
          },

          '&:hover': {
            bgcolor: 'rgba(246, 6, 111, 0.72)',
          },
        },
      },
    },
  });
}

function differentiatorCarousel(): ReactElement {
  const differentiatorPages = [
    [...aerealithDifferentiators].slice(0, 4),
    [...aerealithDifferentiators].slice(4, 8),
  ].filter((page) => page.length > 0);

  return createElement(MediaCarousel, {
    items: differentiatorPages.map((items, index) => ({
      id: `aerealith-differentiator-page-${index + 1}`,
      type: 'custom' as const,
      ariaLabel: `Aerealith AI differentiators page ${index + 1}`,
      content: createElement(FeatureGrid, {
        items,
        columns: {
          xs: 1,
          sm: 2,
          md: 2,
          lg: 2,
          xl: 2,
        },
        gap: {
          xs: 2,
          md: 2.5,
        },
        maxWidth: 900,
        centered: true,
        cardFullHeight: true,
        compactCards: false,
        slotProps: {
          root: {
            sx: {
              width: '100%',
              height: '100%',
              maxWidth: 900,
              mx: 'auto',
              display: 'grid',
              alignItems: 'center',
            },
          },
          grid: {
            sx: {
              alignItems: 'stretch',
            },
          },
          item: {
            sx: {
              minHeight: {
                xs: 250,
                md: 270,
              },
              ...differentiatorCardHoverSx,
            },
          },
        },
      }),
    })),

    autoScroll: false,
    autoScrollInterval: 5200,
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnVideoPlay: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: false,
    showCaptions: false,
    showFullscreenButton: false,
    fullscreen: false,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: false,
    bordered: false,
    elevated: false,
    imageSizes: '100vw',

    slotProps: {
      card: {
        sx: {
          width: '100%',
          bgcolor: 'transparent',
          border: 0,
          boxShadow: 'none',
        },
      },
      viewport: {
        sx: {
          minHeight: {
            xs: 620,
            sm: 540,
            md: 560,
            lg: 560,
            xl: 590,
          },
          aspectRatio: 'auto',
          bgcolor: 'transparent',
        },
      },
      slide: {
        sx: {
          display: 'grid',
          placeItems: 'center',
          p: {
            xs: 0,
            md: 0.5,
          },
        },
      },
      media: {
        sx: {
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'transparent',
        },
      },
      arrows: {
        sx: {
          insetInline: {
            xs: -6,
            md: -12,
          },
        },
      },
      pagination: {
        sx: {
          mt: 2,
        },
      },
      paginationDot: {
        sx: {
          '&[aria-current="true"]': {
            bgcolor: brandAccentColor,
            boxShadow: '0 0 18px rgba(246, 6, 111, 0.55)',
          },

          '&:hover': {
            bgcolor: 'rgba(246, 6, 111, 0.72)',
          },
        },
      },
    },
  });
}

export const HOME_SECTIONS = [
  createElement(MarketingSection, {
    key: 'what-aerealith-ai-does',
    id: 'what-aerealith-ai-does',
    eyebrow: 'What is Aerealith AI?',
    title: 'What Aerealith AI Does',
    description:
      'Aerealith AI is a secure digital command center built to unify your apps, data, communities, automations, and workflows into one intelligent assistant. Instead of acting like another isolated chatbot, Aerealith AI connects the tools you already use, remembers useful context with your permission, helps automate repetitive tasks, and turns scattered information into clear, actionable insight. It is designed for creators, developers, communities, teams, and power users who want one trusted place to manage their digital life, ask better questions, track what matters, and stay in control.',
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1800,
    copyMaxWidth: 1120,
    mediaPosition: 'right',
    mediaBreakpoint: 'lg',
    centerContent: true,
    media: infographicsCarousel(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
  }),

  createElement(MarketingSection, {
    key: 'built-for',
    id: 'built-for',
    eyebrow: 'Who is Aerealith AI for?',
    title: 'Aerealith AI is Built For',
    description:
      'Creators, developers, communities, teams, and power users who manage their lives and work across dozens of apps, platforms, files, conversations, and workflows. It gives creators a smarter way to plan content, organize ideas, manage audiences, and coordinate community engagement. It helps developers connect code, documentation, tasks, deployments, infrastructure, and support workflows into one intelligent workspace. It supports communities with AI-assisted chat, knowledge access, moderation support, announcements, tickets, and automation. For teams, Aerealith AI becomes a secure command center for organizing work, tracking context, reducing repetitive tasks, and turning scattered information into clear, actionable decisions.',
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1800,
    copyMaxWidth: 1120,
    mediaPosition: 'left',
    mediaBreakpoint: 'lg',
    centerContent: true,
    media: builtForImage(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
  }),

  createElement(MarketingSection, {
    key: 'how-it-works',
    id: 'how-it-works',
    eyebrow: 'Simple flow. Powerful results.',
    title: 'How It Works',
    description:
      'Aerealith AI works by bringing the tools, data, conversations, communities, and workflows you already depend on into one secure intelligence layer. Instead of making you jump between apps, dashboards, notes, bots, files, messages, and developer tools, Aerealith AI is designed to become the command center that helps everything work together. You begin by connecting the services and spaces that matter to you. From there, Aerealith AI builds useful context with your permission, remembers what matters, understands how different pieces of information relate to each other, and helps you take action without losing control. The flow is simple: connect what matters, build approved context, reason across your information, take safe action, and review what happened.',
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1800,
    copyMaxWidth: 1120,
    mediaPosition: 'right',
    mediaBreakpoint: 'lg',
    centerContent: true,
    media: howItWorksImage(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
  }),

  createElement(MarketingSection, {
    key: 'product-preview',
    id: 'product-preview',
    eyebrow: 'MVP in progress',
    title: 'Product Preview',
    description:
      'Aerealith AI is being built in public, one production-ready feature at a time, with a focus on transparency, trust, and real progress instead of empty hype. As each core capability is designed, developed, tested, and pushed to production, this section will evolve into a living product showcase with real previews, walkthroughs, screenshots, release notes, and short demos of the live platform. Early updates will highlight the foundation of the MVP, including the web dashboard, AI chat experience, Discord integration, memory lite, basic automation workflows, usage tracking, account settings, waitlist flow, and crowdfunding support system.',
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1900,
    copyMaxWidth: 760,
    mediaPosition: 'left',
    mediaBreakpoint: 'lg',
    gridColumns: ['minmax(0, 0.9fr)', 'minmax(420px, 1.1fr)'],
    centerContent: true,
    mediaFirstOnMobile: false,
    media: productPreviewCarousel(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
    slotProps: {
      media: {
        sx: {
          alignSelf: 'center',
          width: '100%',
          minHeight: {
            xs: 430,
            sm: 500,
            md: 560,
            lg: 560,
            xl: 610,
          },
          maxWidth: {
            xs: '100%',
            lg: 860,
            xl: 960,
          },
          mx: {
            xs: 'auto',
            lg: 0,
          },
        },
      },
    },
  }),

  createElement(MarketingSection, {
    key: differentSection.id,
    id: differentSection.id,
    eyebrow: differentSection.eyebrow,
    title: differentSection.title,
    description: differentSection.description,
    body: differentSection.body,
    variant: differentSection.variant,
    spacingY: differentSection.spacingY,
    align: 'left',
    tone: differentSection.tone,
    copyVariant: differentSection.copyVariant,
    maxWidth: 1900,
    copyMaxWidth: 760,
    mediaMaxWidth: 900,
    centerContent: true,
    mediaPosition: 'right',
    mediaBreakpoint: 'lg',
    mediaFirstOnMobile: false,
    gridColumns: ['minmax(0, 0.92fr)', 'minmax(420px, 1.08fr)'],
    media: differentiatorCarousel(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
    slotProps: {
      media: {
        sx: {
          alignSelf: 'center',
          width: '100%',
          maxWidth: {
            xs: '100%',
            lg: 900,
            xl: 960,
          },
          mx: {
            xs: 'auto',
            lg: 0,
          },
        },
      },
    },
  }),

  createElement(PricingPreviewSection, {
    key: pricingPreviewSection.id,
    id: pricingPreviewSection.id,
    content: pricingPreviewSection,
    variant: 'glass',
    spacingY: 'normal',
    align: 'center',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1900,
    copyMaxWidth: 1120,
    mediaPosition: 'bottom',
    sx: pricingSectionSx,
    copySx: {
      width: '100%',
      maxWidth: 1120,
      mx: 'auto',

      '& h2': pricingTitleSx,
    },
    mediaSx: {
      width: '100%',
      maxWidth: 1700,
      mx: 'auto',
      px: {
        xs: 0,
        sm: 1,
        md: 2,
      },
    },
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx: pricingTitleSx,
      descriptionSx: {
        width: '100%',
        maxWidth: 1120,
        mx: 'auto',
      },
      bodySx: {
        width: '100%',
        maxWidth: 1120,
        mx: 'auto',
      },
    },
    slotProps: {
      container: {
        sx: {
          width: '100%',
          maxWidth: '1900px !important',
          mx: 'auto',
          px: {
            xs: 2,
            sm: 3,
            md: 4,
            lg: 5,
            xl: 6,
          },
        },
      },
      inner: {
        sx: {
          width: '100%',
          maxWidth: '100%',
        },
      },
      copy: {
        sx: {
          width: '100%',
          maxWidth: 1120,
          mx: 'auto',
        },
      },
      media: {
        sx: {
          width: '100%',
          maxWidth: 1700,
          mx: 'auto',
        },
      },
    },
    imageProps: {
      aspectRatio: '21 / 9',
      objectFit: 'contain',
      objectPosition: 'center',
      rounded: true,
      bordered: true,
      elevated: true,
      priority: false,
      sizes: '(max-width: 768px) 100vw, (max-width: 1200px) 94vw, 1700px',
      sx: {
        width: '100%',
        maxWidth: '100%',
        minHeight: {
          xs: 240,
          sm: 320,
          md: 420,
          lg: 520,
          xl: 600,
        },
        bgcolor: 'rgba(0, 0, 0, 0.72)',

        '& img': {
          width: '100% !important',
          height: '100% !important',
          objectFit: 'contain !important',
          objectPosition: 'center center !important',
        },

        '&:fullscreen img': {
          objectFit: 'contain !important',
        },
      },
    },
  }),

  createElement(CrowdfundingSection, {
    key: 'crowdfunding-investor-opportunities',
    id: 'crowdfunding-investor-opportunities',
    content: crowdfundingSection,
    eyebrow: 'Help build Aerealith AI',
    title: 'Crowdfunding & Investor Opportunities',
    description:
      'Aerealith AI is being built with a focused MVP path, a clear long-term platform vision, and a transparent funding strategy designed to turn the project from concept into a real production platform.',
    body: crowdfundingSection.body,
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1900,
    copyMaxWidth: '100%',
    mediaPosition: 'right',
    centerContent: true,
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
  }),

  createElement(MarketingSection, {
    key: 'trust-privacy-principles',
    id: 'trust-privacy-principles',
    eyebrow: 'Built around user control',
    title: 'Trust & Privacy Principles',
    description:
      'Aerealith AI is being designed around trust, privacy, transparency, and user control from the beginning because powerful AI should make users feel more secure, not less in control. The goal is to give people useful assistance across their apps, data, communities, workflows, and automations without asking them to surrender ownership of their information or decisions. Memory should be permissioned, reviewable, editable, and removable, so users can understand what Aerealith AI remembers, why it matters, and when it should be changed or forgotten. Automations should be clear, intentional, and auditable, with no hidden background control, no silent actions, and no sensitive changes without the right level of consent. Integrations should use scoped access, giving Aerealith AI only the permissions needed for a specific task instead of unrestricted control over a user’s accounts or systems. Sensitive information should be minimized, protected by strong security boundaries, and used only to make the assistant more useful within the user’s approved context. As Aerealith AI grows, trust will remain part of the product foundation: user-owned data, transparent permissions, responsible AI behavior, clear privacy choices, export and deletion options, and honest limits about what Aerealith AI can and cannot do.',
    variant: 'glass',
    spacingY: 'normal',
    align: 'left',
    tone: 'secondary',
    copyVariant: 'section',
    maxWidth: 1900,
    copyMaxWidth: 760,
    mediaMaxWidth: 900,
    centerContent: true,
    mediaPosition: 'left',
    mediaBreakpoint: 'lg',
    mediaFirstOnMobile: true,
    gridColumns: ['minmax(420px, 1.08fr)', 'minmax(0, 0.92fr)'],
    media: principlesCarousel(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
    slotProps: {
      media: {
        sx: {
          alignSelf: 'center',
          width: '100%',
          minWidth: 0,
          minHeight: {
            xs: 430,
            sm: 500,
            md: 560,
            lg: 560,
            xl: 610,
          },
          maxWidth: {
            xs: '100%',
            lg: 900,
            xl: 960,
          },
          mx: {
            xs: 'auto',
            lg: 0,
          },
        },
      },
      copy: {
        sx: {
          width: '100%',
          maxWidth: 760,
        },
      },
    },
  }),

  createElement(MarketingSection, {
    key: faqSection.id,
    id: faqSection.id,
    eyebrow: faqSection.eyebrow,
    title: faqSection.title,
    description: faqSection.description,
    body: faqSection.body,
    variant: faqSection.variant,
    spacingY: faqSection.spacingY,
    align: faqSection.align,
    tone: faqSection.tone,
    copyVariant: faqSection.copyVariant,
    maxWidth: faqSection.maxWidth,
    copyMaxWidth: faqSection.copyMaxWidth,
    mediaMaxWidth: 700,
    centerContent: faqSection.centerContent,
    mediaPosition: 'right',
    mediaBreakpoint: 'lg',
    mediaFirstOnMobile: false,
    gridColumns: ['minmax(0, 1fr)', 'minmax(360px, 0.82fr)'],
    media: faqCarousel(),
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx,
    },
    slotProps: {
      media: {
        sx: {
          alignSelf: 'center',
          width: '100%',
          minWidth: 0,
          maxWidth: {
            xs: '100%',
            lg: 700,
            xl: 720,
          },
          mx: {
            xs: 'auto',
            lg: 0,
          },
        },
      },
      copy: {
        sx: {
          width: '100%',
          maxWidth: 760,
        },
      },
    },
  }),
] as const satisfies readonly ReactElement[];

/**
 * Rendered Home page content.
 *
 * Metadata has been removed from this content object and should be handled by
 * the app-level metadata files or route-level metadata exports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator page
 */
export const SECTIONS_DATA: SectionsProps = {
  pageTitle: 'Aerealith AI',
  sections: HOME_SECTIONS,
};

/**
 * Backwards-compatible Home page content export.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const HOME_PAGE_CONTENT = SECTIONS_DATA;