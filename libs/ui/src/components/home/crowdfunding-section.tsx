// libs/ui/src/components/home/crowdfunding-section.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';

import type {
  CarouselItem,
  CdnVideoInput,
  MarketingSectionProps,
} from '../../types';
import { mergeSx } from '../../utils';
import MarketingSection from '../marketing/marketing-section';
import MediaCarousel from '../media/carousel';

type MediaCarouselComponentProps = React.ComponentProps<typeof MediaCarousel>;

export type CrowdfundingSectionContent = {
  id?: string;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  body?: React.ReactNode;
  footnote?: React.ReactNode;
  actions?: React.ReactNode;

  /**
   * First-class carousel items.
   *
   * Supports image, video, PowerPoint, and custom slides.
   */
  media?: readonly CarouselItem[];

  /**
   * CDN video shorthand.
   *
   * Use this when your content package stores videos without manually
   * creating full CarouselItem objects.
   */
  videos?: readonly CdnVideoInput[];
};

export interface CrowdfundingSectionProps
  extends Omit<
    MarketingSectionProps,
    | 'id'
    | 'content'
    | 'eyebrow'
    | 'title'
    | 'description'
    | 'body'
    | 'children'
    | 'footnote'
    | 'actions'
    | 'media'
    | 'mediaPosition'
  > {
  id?: string;

  content?: CrowdfundingSectionContent;

  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
  footnote?: React.ReactNode;
  actions?: React.ReactNode;

  items?: readonly CarouselItem[];
  videos?: readonly CdnVideoInput[];

  /**
   * Optional complete media override.
   *
   * When provided, this renders instead of the default MediaCarousel.
   */
  mediaSlot?: React.ReactNode;

  mediaPosition?: MarketingSectionProps['mediaPosition'];

  mediaCarouselProps?: Omit<
    MediaCarouselComponentProps,
    'items' | 'children' | 'cdnVideos'
  >;
}

const DEFAULT_CROWDFUNDING_DESCRIPTION =
  'Support the infrastructure, engineering, security, design, integrations, documentation, and production systems needed to bring Aerealith AI to production.';

function toArray<T>(value: readonly T[] | undefined): T[] {
  return value ? [...value] : [];
}

export function CrowdfundingSection({
  id,
  content,

  eyebrow,
  title,
  description,
  body,
  children,
  footnote,
  actions,

  items,
  videos,

  mediaSlot,
  mediaPosition = 'bottom',
  mediaCarouselProps,

  variant = 'glass',
  spacingY = 'normal',
  align = 'center',
  tone = 'secondary',
  copyVariant = 'section',
  maxWidth = '100%',
  copyMaxWidth = 1180,

  sx,
  mediaSx,
  ...sectionProps
}: CrowdfundingSectionProps): React.ReactElement {
  const resolvedItems = React.useMemo(
    () => toArray(items ?? content?.media),
    [content?.media, items],
  );

  const resolvedVideos = React.useMemo(
    () => toArray(videos ?? content?.videos),
    [content?.videos, videos],
  );

  const hasCarouselMedia =
    resolvedItems.length > 0 ||
    resolvedVideos.length > 0 ||
    Boolean(mediaCarouselProps?.autoDiscoverImages) ||
    Boolean(mediaCarouselProps?.powerpoints?.length);

  const media =
    mediaSlot ??
    (hasCarouselMedia ? (
      <Box
        sx={mergeSx(
          {
            width: '100%',
            maxWidth: 1500,
            mx: 'auto',
            bgcolor: 'transparent',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
          },
          mediaSx,
        )}
      >
        <MediaCarousel
          items={resolvedItems.length > 0 ? resolvedItems : undefined}
          cdnVideos={resolvedVideos}
          autoScroll={false}
          autoScrollInterval={7000}
          pauseOnHover
          pauseOnFocus
          pauseOnVideoPlay
          loop
          showArrows
          showPagination
          showProgress={false}
          showCaptions
          showFullscreenButton
          fullscreen
          aspectRatio="16 / 9"
          objectFit="contain"
          objectPosition="center"
          rounded
          bordered={false}
          elevated={false}
          imageSizes="100vw"
          slotProps={{
            card: {
              sx: {
                width: '100%',
                maxWidth: '100%',
                bgcolor: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
                boxShadow: 'none',
              },
            },
            viewport: {
              sx: {
                bgcolor: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
              },
            },
            slide: {
              sx: {
                bgcolor: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
              },
            },
            media: {
              sx: {
                bgcolor: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
              },
            },
            caption: {
              sx: {
                textAlign: 'center',
                bgcolor: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
              },
            },
          }}
          {...mediaCarouselProps}
        />
      </Box>
    ) : null);

  return (
    <MarketingSection
      id={id ?? content?.id ?? 'crowdfunding'}
      eyebrow={eyebrow ?? content?.eyebrow ?? 'Community Funding'}
      title={title ?? content?.title ?? 'Help Build Aerealith AI'}
      description={
        description ??
        content?.description ??
        'Help fund the platform work needed to turn Aerealith AI into a reliable command center for users, creators, developers, teams, and organizations.'
      }
      body={body ?? content?.body ?? DEFAULT_CROWDFUNDING_DESCRIPTION}
      footnote={footnote ?? content?.footnote}
      actions={actions ?? content?.actions}
      media={media}
      mediaPosition={mediaPosition}
      variant={variant}
      spacingY={spacingY}
      align={align}
      tone={tone}
      copyVariant={copyVariant}
      maxWidth={maxWidth}
      copyMaxWidth={copyMaxWidth}
      sx={sx}
      {...sectionProps}
    >
      {children}
    </MarketingSection>
  );
}

export default CrowdfundingSection;
