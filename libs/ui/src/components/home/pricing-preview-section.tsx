// libs/ui/src/components/home/pricing-preview-section.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';

import MarketingSection from '../marketing/marketing-section';
import MediaImage from '../media/image';
import type { MarketingSectionProps, MediaImageProps } from '../../types';
import { mergeSx } from '../../utils';

export type PricingPreviewImageContent = {
  src: MediaImageProps['src'];
  alt: string;
};

export type PricingPreviewSectionContent = {
  id?: string;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  body?: React.ReactNode;
  footnote?: React.ReactNode;
  actions?: React.ReactNode;
  image?: PricingPreviewImageContent;
};

export interface PricingPreviewSectionProps
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

  content?: PricingPreviewSectionContent;

  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
  footnote?: React.ReactNode;
  actions?: React.ReactNode;

  image?: PricingPreviewImageContent;

  /**
   * Optional complete media override.
   *
   * When provided, this renders instead of the default MediaImage.
   */
  imageSlot?: React.ReactNode;

  mediaPosition?: MarketingSectionProps['mediaPosition'];

  imageProps?: Omit<MediaImageProps, 'src' | 'alt'>;
}

const DEFAULT_PRICING_IMAGE = {
  src: '/images/Pricing.png',
  alt: 'Helix AI pricing tiers and plan comparison',
} as const satisfies PricingPreviewImageContent;

const DEFAULT_PRICING_DESCRIPTION =
  'Start small with the features you need today, then scale as your workflow grows.';

const DEFAULT_PRICING_BODY =
  'Helix AI is planned with simple, transparent tiers so users can start free, explore the platform, and upgrade only when they need more capability. The goal is to make pricing easy to understand while still supporting individuals, creators, developers, teams, and organizations that need stronger governance, analytics, integrations, automation, or enterprise deployment options.';

export function PricingPreviewSection({
  id,
  content,

  eyebrow,
  title,
  description,
  body,
  children,
  footnote,
  actions,

  image,
  imageSlot,
  imageProps,
  mediaPosition = 'bottom',

  variant = 'glass',
  spacingY = 'normal',
  align = 'center',
  tone = 'secondary',
  copyVariant = 'section',
  maxWidth = '100%',
  copyMaxWidth = '100%',

  sx,
  mediaSx,
  ...sectionProps
}: PricingPreviewSectionProps): React.ReactElement {
  const resolvedImage = image ?? content?.image ?? DEFAULT_PRICING_IMAGE;

  const media =
    imageSlot ??
    (resolvedImage ? (
      <Box
        sx={mergeSx(
          {
            width: '100%',
            maxWidth: '100%',
            mx: 'auto',
            overflow: 'hidden',
          },
          mediaSx,
        )}
      >
        <MediaImage
          src={resolvedImage.src}
          alt={resolvedImage.alt}
          aspectRatio="21 / 9"
          objectFit="fill"
          objectPosition="center"
          rounded
          bordered
          elevated
          priority={false}
          sizes="100vw"
          fullscreenOnClick
          sx={{
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
          }}
          {...imageProps}
        />
      </Box>
    ) : null);

  return (
    <MarketingSection
      id={id ?? content?.id ?? 'pricing-preview'}
      eyebrow={eyebrow ?? content?.eyebrow ?? 'Plans & Pricing'}
      title={title ?? content?.title ?? 'Pricing Preview'}
      description={
        description ?? content?.description ?? DEFAULT_PRICING_DESCRIPTION
      }
      body={body ?? content?.body ?? DEFAULT_PRICING_BODY}
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

export default PricingPreviewSection;