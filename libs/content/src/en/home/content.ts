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
} from '@helix-ai/ui';

import { crowdfundingSection } from './crowdfunding';
import { differentSection, helixDifferentiators } from './different';
import { faqCards, faqSection, type FaqCardItem } from './faq';
import { pricingPreviewSection } from './pricing';

export const HERO_DATA = {
  title: 'Helix AI — Your Digital Life, Intelligently Connected',
  subtitle:
    'Helix AI is a secure virtual assistant designed to bring your digital life into one intelligent command center. It goes beyond basic voice commands by connecting your apps, organizing your data, automating repetitive tasks, monitoring important systems, and turning scattered information into clear, actionable insight. Built for work, home, creators, developers, and infrastructure operators, Helix helps you ask better questions, manage complex workflows, track what matters, and stay in control across the tools and platforms you rely on every day.',
  imageUrl: '/images/hero.png',
  imageAlt: 'Helix AI futuristic hero artwork',
} as const;

export const INVESTOR_VIDEO = {
  id: 'helix-ai-investor-video',
  src: 'Helix_AI_Investor_wvztbl',
  title: 'A Call to Investors',
  eyebrow: 'Investor Opportunity',
  body: 'Helix AI is being built as more than another assistant. It is a secure, extensible command center for modern digital life, designed to connect apps, automate workflows, organize knowledge, monitor systems, and turn scattered data into usable insight. We are looking for aligned investors who understand the long-term opportunity in user-owned AI, private automation, infrastructure intelligence, and trusted digital companions.',
} as const;

export type SectionPageMetadata = {
  title: string;
  description: string;
  keywords?: readonly string[];
  canonical?: string;
  openGraph?: {
    title: string;
    description: string;
    image?: string;
    url?: string;
  };
};

export interface SectionsProps {
  pageTitle: string;
  metadata: SectionPageMetadata;
  sections: readonly ReactElement[];
}

export const INFOGRAPHICS_PUBLIC_PATH = '/images/Branding/infographics';
export const PRODUCT_PREVIEW_PATH = '/images/home/product-preview';
export const PRINCIPLES_PATH = '/images/home/principles';

export const DEFAULT_MEDIA_MAX_SCAN_COUNT = 100;
export const DEFAULT_MEDIA_START_INDEX = 1;
export const DEFAULT_MEDIA_STOP_AFTER_MISSES = 1;

const titleSx = {
  color: 'var(--helix-pink, #ff1493)',
} as const;

const pricingTitleSx = {
  color: 'var(--helix-pink, #ff1493)',
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
      color: 'var(--helix-pink, #ff1493) !important',
      textShadow: '0 0 18px rgba(246, 6, 111, 0.35)',
    },
} as const;

const pricingSectionSx = {
  width: '100vw',
  maxWidth: '100vw',
  mx: 'calc(50% - 50vw)',

  '& .MuiContainer-root': {
    width: '100vw !important',
    maxWidth: '100vw !important',
  },

  '& h2': {
    color: 'var(--helix-pink, #ff1493) !important',
    textShadow:
      '0 0 12px rgba(255, 20, 147, 0.34), 0 0 28px rgba(246, 6, 111, 0.18)',
  },

  '& p': {
    maxWidth: '80vw !important',
  },
} as const;

const principleCarouselItems = [
  {
    id: 'principle-01',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_01.png`,
    alt: 'Helix AI principle 01',
    title: 'Principle 01',
  },
  {
    id: 'principle-02',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_02.png`,
    alt: 'Helix AI principle 02',
    title: 'Principle 02',
  },
  {
    id: 'principle-03',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_03.png`,
    alt: 'Helix AI principle 03',
    title: 'Principle 03',
  },
  {
    id: 'principle-04',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_04.png`,
    alt: 'Helix AI principle 04',
    title: 'Principle 04',
  },
  {
    id: 'principle-05',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_05.png`,
    alt: 'Helix AI principle 05',
    title: 'Principle 05',
  },
  {
    id: 'principle-06',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_06.png`,
    alt: 'Helix AI principle 06',
    title: 'Principle 06',
  },
  {
    id: 'principle-07',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_07.png`,
    alt: 'Helix AI principle 07',
    title: 'Principle 07',
  },
  {
    id: 'principle-08',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_08.png`,
    alt: 'Helix AI principle 08',
    title: 'Principle 08',
  },
  {
    id: 'principle-09',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_09.png`,
    alt: 'Helix AI principle 09',
    title: 'Principle 09',
  },
  {
    id: 'principle-10',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_10.png`,
    alt: 'Helix AI principle 10',
    title: 'Principle 10',
  },
  {
    id: 'principle-11',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_11.png`,
    alt: 'Helix AI principle 11',
    title: 'Principle 11',
  },
  {
    id: 'principle-12',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_12.png`,
    alt: 'Helix AI principle 12',
    title: 'Principle 12',
  },
  {
    id: 'principle-13',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_13.png`,
    alt: 'Helix AI principle 13',
    title: 'Principle 13',
  },
  {
    id: 'principle-14',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_14.png`,
    alt: 'Helix AI principle 14',
    title: 'Principle 14',
  },
  {
    id: 'principle-15',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_15.png`,
    alt: 'Helix AI principle 15',
    title: 'Principle 15',
  },
  {
    id: 'principle-16',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_16.png`,
    alt: 'Helix AI principle 16',
    title: 'Principle 16',
  },
  {
    id: 'principle-17',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_17.png`,
    alt: 'Helix AI principle 17',
    title: 'Principle 17',
  },
  {
    id: 'principle-18',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_18.png`,
    alt: 'Helix AI principle 18',
    title: 'Principle 18',
  },
  {
    id: 'principle-19',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_19.png`,
    alt: 'Helix AI principle 19',
    title: 'Principle 19',
  },
  {
    id: 'principle-20',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_20.png`,
    alt: 'Helix AI principle 20',
    title: 'Principle 20',
  },
  {
    id: 'principle-21',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_21.png`,
    alt: 'Helix AI principle 21',
    title: 'Principle 21',
  },
  {
    id: 'principle-22',
    type: 'image' as const,
    src: `${PRINCIPLES_PATH}/principle_22.png`,
    alt: 'Helix AI principle 22',
    title: 'Principle 22',
  },
] as const;

function builtForImage(): ReactElement {
  return createElement(MediaImage, {
    src: '/images/built_for.png',
    alt: 'Helix AI built for developers, creators, teams, infrastructure operators, and digital workflows',
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
    src: '/images/how_it_works.png',
    alt: 'Helix AI how it works illustration',
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
    autoDiscoverImages: true,
    imageBasePath: INFOGRAPHICS_PUBLIC_PATH,
    imageFilePrefix: 'info_',
    imageExtension: 'png',
    startIndex: DEFAULT_MEDIA_START_INDEX,
    maxImages: DEFAULT_MEDIA_MAX_SCAN_COUNT,
    stopAfterMisses: DEFAULT_MEDIA_STOP_AFTER_MISSES,
    imageAltPrefix: 'Helix AI infographic',
    imageTitlePrefix: 'Infographic',

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
    imageFilePrefix: 'preview_',
    imageExtension: 'png',
    startIndex: DEFAULT_MEDIA_START_INDEX,
    maxImages: DEFAULT_MEDIA_MAX_SCAN_COUNT,
    stopAfterMisses: DEFAULT_MEDIA_STOP_AFTER_MISSES,
    imageAltPrefix: 'Helix AI product preview',
    imageTitlePrefix: 'Product Preview',

    cdnVideos: [
      {
        id: 'helix-ai-notebooklm-brief',
        title: 'Helix AI Command Center Brief',
        description:
          'A short NotebookLM-generated audio/video brief introducing the Helix AI command center concept, including its role as a secure hub for apps, data, workflows, automation, and intelligent digital operations.',
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

    slotProps: {
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
    },
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

    slotProps: {
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
    },
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
            bgcolor: 'var(--helix-pink, #ff1493)',
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
    [...helixDifferentiators].slice(0, 4),
    [...helixDifferentiators].slice(4, 8),
  ].filter((page) => page.length > 0);

  return createElement(MediaCarousel, {
    items: differentiatorPages.map((items, index) => ({
      id: `helix-differentiator-page-${index + 1}`,
      type: 'custom' as const,
      ariaLabel: `Helix AI differentiators page ${index + 1}`,
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
            bgcolor: 'var(--helix-pink, #ff1493)',
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
    key: 'what-helix-ai-does',
    id: 'what-helix-ai-does',
    eyebrow: 'What is Helix AI?',
    title: 'What Helix AI Does',
    description:
      'Helix AI is a secure digital command center built to unify your apps, data, communities, automations, and workflows into one intelligent assistant. Instead of acting like another isolated chatbot, Helix connects the tools you already use, remembers useful context with your permission, helps automate repetitive tasks, and turns scattered information into clear, actionable insight. It is designed for creators, developers, communities, teams, and power users who want one trusted place to manage their digital life, ask better questions, track what matters, and stay in control.',
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
    eyebrow: 'Who is Helix AI for?',
    title: 'Helix AI is Built For',
    description:
      'Creators, developers, communities, teams, and power users who manage their lives and work across dozens of apps, platforms, files, conversations, and workflows. It gives creators a smarter way to plan content, organize ideas, manage audiences, and coordinate community engagement. It helps developers connect code, documentation, tasks, deployments, infrastructure, and support workflows into one intelligent workspace. It supports communities with AI-assisted chat, knowledge access, moderation support, announcements, tickets, and automation. For teams, Helix AI becomes a secure command center for organizing work, tracking context, reducing repetitive tasks, and turning scattered information into clear, actionable decisions.',
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
      'Helix AI works by bringing the tools, data, conversations, communities, and workflows you already depend on into one secure intelligence layer. Instead of making you jump between apps, dashboards, notes, bots, files, messages, and developer tools, Helix is designed to become the command center that helps everything work together. You begin by connecting the services and spaces that matter to you. From there, Helix builds useful context with your permission, remembers what matters, understands how different pieces of information relate to each other, and helps you take action without losing control. The flow is simple: connect what matters, build approved context, reason across your information, take safe action, and review what happened.',
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
      'Helix AI is being built in public, one production-ready feature at a time, with a focus on transparency, trust, and real progress instead of empty hype. As each core capability is designed, developed, tested, and pushed to production, this section will evolve into a living product showcase with real previews, walkthroughs, screenshots, release notes, and short demos of the live platform. Early updates will highlight the foundation of the MVP, including the web dashboard, AI chat experience, Discord integration, memory lite, basic automation workflows, usage tracking, account settings, waitlist flow, and crowdfunding support system.',
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
    maxWidth: '100vw',
    copyMaxWidth: '80vw',
    mediaPosition: 'bottom',
    sx: pricingSectionSx,
    copySx: {
      width: '80vw',
      maxWidth: '80vw',
      mx: 'auto',

      '& h2, & p, & .MuiTypography-root': {
        maxWidth: '80vw !important',
      },

      '& h2': pricingTitleSx,
    },
    mediaSx: {
      width: '100vw',
      maxWidth: '100vw',
      mx: 'auto',
      px: {
        xs: 2,
        sm: 3,
        md: 4,
        lg: 5,
      },
    },
    copyProps: {
      titleComponent: 'h2',
      titleVariant: 'h2',
      titleSx: pricingTitleSx,
      descriptionSx: {
        width: '80vw',
        maxWidth: '80vw !important',
        mx: 'auto',
      },
      bodySx: {
        width: '80vw',
        maxWidth: '80vw !important',
        mx: 'auto',
      },
    },
    slotProps: {
      container: {
        sx: {
          width: '100vw',
          maxWidth: '100vw !important',
          px: {
            xs: 2,
            sm: 3,
            md: 4,
            lg: 5,
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
          width: '80vw',
          maxWidth: '80vw !important',
          mx: 'auto',

          '& h2, & p, & .MuiTypography-root': {
            maxWidth: '80vw !important',
          },
        },
      },
      media: {
        sx: {
          width: '100vw',
          maxWidth: '100vw',
        },
      },
    },
    imageProps: {
      aspectRatio: '21 / 9',
      objectFit: 'fill',
      objectPosition: 'center',
      rounded: true,
      bordered: true,
      elevated: true,
      priority: false,
      sizes: '100vw',
      sx: {
        width: '100%',
        maxWidth: '100%',
        minHeight: {
          xs: 420,
          sm: 540,
          md: 700,
          lg: 820,
          xl: 940,
        },
        bgcolor: 'rgba(0, 0, 0, 0.72)',

        '& img': {
          width: '100% !important',
          height: '100% !important',
          objectFit: 'fill !important',
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
    eyebrow: 'Help build Helix AI',
    title: 'Crowdfunding & Investor Opportunities',
    description:
      'Helix AI is being built with a focused MVP path, a clear long-term platform vision, and a transparent funding strategy designed to turn the project from concept into a real production platform.',
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
      'Helix AI is being designed around trust, privacy, transparency, and user control from the beginning because powerful AI should make users feel more secure, not less in control. The goal is to give people useful assistance across their apps, data, communities, workflows, and automations without asking them to surrender ownership of their information or decisions. Memory should be permissioned, reviewable, editable, and removable, so users can understand what Helix remembers, why it matters, and when it should be changed or forgotten. Automations should be clear, intentional, and auditable, with no hidden background control, no silent actions, and no sensitive changes without the right level of consent. Integrations should use scoped access, giving Helix only the permissions needed for a specific task instead of unrestricted control over a user’s accounts or systems. Sensitive information should be minimized, protected by strong security boundaries, and used only to make the assistant more useful within the user’s approved context. As Helix grows, trust will remain part of the product foundation: user-owned data, transparent permissions, responsible AI behavior, clear privacy choices, export and deletion options, and honest limits about what Helix AI can and cannot do.',
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

export const SECTIONS_DATA: SectionsProps = {
  pageTitle: 'Helix AI',

  metadata: {
    title: 'Helix AI — Your Digital Life, Intelligently Connected',
    description:
      'Helix AI is a secure, extensible AI assistant platform for automation, analytics, memory, integrations, monitoring, and digital workflow orchestration.',
    keywords: [
      'Helix AI',
      'AI assistant',
      'automation',
      'digital companion',
      'workflow automation',
      'analytics',
      'infrastructure monitoring',
      'user-owned AI',
      'SinLess Games LLC',
    ],
    canonical: 'https://helixaibot.com',
    openGraph: {
      title: 'Helix AI — Your Digital Life, Intelligently Connected',
      description:
        'Connect apps, automate workflows, organize knowledge, monitor systems, and turn scattered information into clear, actionable insight.',
      image: '/og-image.png',
      url: 'https://helixaibot.com',
    },
  },

  sections: HOME_SECTIONS,
};

export const HOME_PAGE_CONTENT = SECTIONS_DATA;