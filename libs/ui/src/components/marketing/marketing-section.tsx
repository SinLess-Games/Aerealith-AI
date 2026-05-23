// libs/ui/src/components/marketing/marketing-section.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles';

import FeatureCard from '../cards/feature-card';
import MediaCarousel from '../media/carousel';
import FeatureGrid from './feature-grid';
import MarketingCopy from './marketing-copy';
import type {
  CarouselItem,
  FeatureGridItem,
  MarketingSectionFeatureLayout,
  MarketingSectionMediaPosition,
  MarketingSectionProps,
  MarketingSectionSpacing,
  MarketingSectionVariant,
} from '../../types';
import { mergeSx } from '../../utils';

export type {
  MarketingSectionFeatureLayout,
  MarketingSectionMediaPosition,
  MarketingSectionProps,
  MarketingSectionSlotProps,
  MarketingSectionSpacing,
  MarketingSectionVariant,
} from '../../types';

const spacingYMap: Record<MarketingSectionSpacing, SxProps<Theme>> = {
  none: {
    py: 0,
  },
  compact: {
    py: { xs: 4, md: 6, lg: 7 },
  },
  normal: {
    py: { xs: 7, md: 10, lg: 12 },
  },
  spacious: {
    py: { xs: 9, md: 13, lg: 16 },
  },
};

function isSideMedia(position: MarketingSectionMediaPosition): boolean {
  return position === 'left' || position === 'right';
}

function mediaComesFirst(position: MarketingSectionMediaPosition): boolean {
  return position === 'left' || position === 'top';
}

function getFeatureItemKey(item: FeatureGridItem, index: number): string {
  if (item.id) {
    return item.id;
  }

  if (typeof item.title === 'string') {
    return item.title;
  }

  return `marketing-feature-${index}`;
}

function getVariantSx(
  theme: Theme,
  variant: MarketingSectionVariant,
): SxProps<Theme> {
  const isDark = theme.palette.mode === 'dark';

  switch (variant) {
    case 'plain':
      return {
        bgcolor: 'transparent',
      };

    case 'surface':
      return {
        bgcolor: 'background.paper',
      };

    case 'glass':
      return {
        position: 'relative',
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#050716', 0.48) : alpha('#ffffff', 0.58),
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 10% 8%, rgba(0, 229, 255, 0.12), transparent 30%), radial-gradient(circle at 88% 16%, rgba(246, 6, 111, 0.14), transparent 34%)',
        },
      };

    case 'gradient':
      return {
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
        background:
          'linear-gradient(135deg, rgba(2, 19, 37, 0.94), rgba(17, 15, 48, 0.9), rgba(35, 11, 58, 0.92))',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 8% 12%, rgba(0, 229, 255, 0.16), transparent 32%), radial-gradient(circle at 78% 18%, rgba(246, 6, 111, 0.18), transparent 34%)',
        },
      };

    case 'dark':
      return {
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
        bgcolor: '#050716',
      };

    case 'default':
    default:
      return {
        bgcolor: 'transparent',
      };
  }
}

function getFeatureLayout({
  featureLayout,
  hasGridFeatures,
  hasCarouselContent,
}: {
  featureLayout: MarketingSectionFeatureLayout;
  hasGridFeatures: boolean;
  hasCarouselContent: boolean;
}): MarketingSectionFeatureLayout {
  if (featureLayout === 'carousel') {
    return hasCarouselContent ? 'carousel' : 'none';
  }

  if (featureLayout === 'grid') {
    return hasGridFeatures ? 'grid' : 'none';
  }

  return 'none';
}

function createFeatureCarouselItems({
  features,
  cardFullHeight,
  compactCards,
}: {
  features: readonly FeatureGridItem[];
  cardFullHeight: boolean;
  compactCards: boolean;
}): CarouselItem[] {
  return features.map((feature, index) => ({
    id: feature.id ?? getFeatureItemKey(feature, index),
    type: 'custom',
    title: feature.title,
    description: feature.description,
    content: (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'grid',
          p: {
            xs: 2,
            md: 2.5,
          },
        }}
      >
        <FeatureCard
          {...feature}
          compact={feature.compact ?? compactCards}
          fullHeight={feature.fullHeight ?? cardFullHeight}
        />
      </Box>
    ),
  }));
}

export function MarketingSection({
  component = 'section',

  eyebrow,
  title,
  subtitle,
  description,
  body,
  children,
  actions,
  footnote,

  media,
  mediaPosition = 'right',
  mediaFirstOnMobile = false,

  features = [],
  featureLayout = 'grid',
  carouselItems = [],
  featureGridProps,
  carouselProps,

  variant = 'default',
  spacingY = 'normal',
  align = 'center',
  tone = 'default',
  copyVariant = 'section',

  maxWidth = 1440,
  copyMaxWidth,
  mediaMaxWidth,

  fullHeight = false,
  centerContent = true,

  gridColumns = ['minmax(0, 0.92fr)', 'minmax(0, 1.08fr)'],
  mediaBreakpoint = 'lg',

  copyProps,
  background,

  containerSx,
  innerSx,
  copySx,
  mediaSx,
  featuresSx,

  slotProps,
  sx,
  ...boxProps
}: MarketingSectionProps): React.ReactElement {
  const theme = useTheme();
  const titleId = React.useId().replace(/:/g, '');
  const resolvedTitleId = title
    ? `helix-marketing-section-${titleId}`
    : undefined;

  const hasMedia = Boolean(media);
  const sideMedia = hasMedia && isSideMedia(mediaPosition);

  const safeFeatures = React.useMemo(() => [...features], [features]);
  const safeCarouselItems = React.useMemo(
    () => [...carouselItems],
    [carouselItems],
  );

  const carouselFeatureItems = React.useMemo(
    () =>
      safeCarouselItems.length > 0
        ? safeCarouselItems
        : createFeatureCarouselItems({
            features: safeFeatures,
            cardFullHeight: featureGridProps?.cardFullHeight ?? true,
            compactCards: featureGridProps?.compactCards ?? false,
          }),
    [
      featureGridProps?.cardFullHeight,
      featureGridProps?.compactCards,
      safeCarouselItems,
      safeFeatures,
    ],
  );

  const hasCarouselContent =
    carouselFeatureItems.length > 0 ||
    Boolean(carouselProps?.cdnVideos?.length) ||
    Boolean(carouselProps?.powerpoints?.length) ||
    Boolean(carouselProps?.autoDiscoverImages);

  const resolvedFeatureLayout = getFeatureLayout({
    featureLayout,
    hasGridFeatures: safeFeatures.length > 0,
    hasCarouselContent,
  });

  const contentDesktopOrder = mediaPosition === 'left' ? 2 : 1;
  const mediaDesktopOrder = mediaPosition === 'left' ? 1 : 2;
  const contentMobileOrder = mediaFirstOnMobile ? 2 : 1;
  const mediaMobileOrder = mediaFirstOnMobile ? 1 : 2;

  const sectionVariantSx = getVariantSx(theme, variant);

  const mediaNode = hasMedia ? (
    <Box
      {...slotProps?.media}
      sx={mergeSx(
        {
          order: sideMedia
            ? {
                xs: mediaMobileOrder,
                [mediaBreakpoint]: mediaDesktopOrder,
              }
            : undefined,
          width: '100%',
          maxWidth: mediaMaxWidth,
          mx:
            mediaPosition === 'top' || mediaPosition === 'bottom'
              ? 'auto'
              : undefined,
          minWidth: 0,
        },
        mediaSx,
        slotProps?.media?.sx,
      )}
    >
      {media}
    </Box>
  ) : null;

  const copyNode = (
    <Box
      {...slotProps?.copy}
      sx={mergeSx(
        {
          order: sideMedia
            ? {
                xs: contentMobileOrder,
                [mediaBreakpoint]: contentDesktopOrder,
              }
            : undefined,
          width: '100%',
          minWidth: 0,
        },
        copySx,
        slotProps?.copy?.sx,
      )}
    >
      <MarketingCopy
        {...copyProps}
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        description={description}
        body={body}
        actions={actions}
        footnote={footnote}
        align={align}
        tone={tone}
        variant={copyVariant}
        maxWidth={copyMaxWidth}
        centered={!sideMedia}
        titleId={resolvedTitleId}
      >
        {children}
      </MarketingCopy>
    </Box>
  );

  const featuresNode =
    resolvedFeatureLayout !== 'none' ? (
      <Box
        {...slotProps?.features}
        sx={mergeSx(
          {
            width: '100%',
            mt: {
              xs: 4,
              md: 5,
            },
          },
          featuresSx,
          slotProps?.features?.sx,
        )}
      >
        {resolvedFeatureLayout === 'carousel' ? (
          <MediaCarousel
            showCaptions={false}
            showProgress={false}
            autoScroll={false}
            pauseOnHover
            pauseOnFocus
            pauseOnVideoPlay
            loop
            aspectRatio="16 / 9"
            objectFit="contain"
            objectPosition="center"
            rounded
            bordered
            elevated
            {...carouselProps}
            items={
              carouselFeatureItems.length > 0 ? carouselFeatureItems : undefined
            }
          />
        ) : (
          <FeatureGrid
            {...featureGridProps}
            items={safeFeatures}
            align={featureGridProps?.align ?? align}
          />
        )}
      </Box>
    ) : null;

  return (
    <Box
      component={component}
      aria-labelledby={resolvedTitleId}
      {...boxProps}
      {...slotProps?.root}
      sx={mergeSx(
        {
          position: 'relative',
          width: '100%',
          minHeight: fullHeight ? '100dvh' : undefined,
        },
        spacingYMap[spacingY],
        sectionVariantSx,
        sx,
        slotProps?.root?.sx,
      )}
    >
      {background ? (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {background}
        </Box>
      ) : null}

      <Container
        maxWidth={false}
        {...slotProps?.container}
        sx={mergeSx(
          {
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4, lg: 6 },
          },
          containerSx,
          slotProps?.container?.sx,
        )}
      >
        <Box
          {...slotProps?.inner}
          sx={mergeSx(
            {
              display: 'grid',
              gridTemplateColumns: sideMedia
                ? {
                    xs: '1fr',
                    [mediaBreakpoint]: `${gridColumns[0]} ${gridColumns[1]}`,
                  }
                : '1fr',
              gap: hasMedia
                ? {
                    xs: 4,
                    md: 6,
                    lg: 8,
                  }
                : 0,
              alignItems: centerContent ? 'center' : 'start',
              minHeight: fullHeight ? 'inherit' : undefined,
            },
            innerSx,
            slotProps?.inner?.sx,
          )}
        >
          {mediaComesFirst(mediaPosition) ? mediaNode : null}
          {copyNode}
          {mediaComesFirst(mediaPosition) ? null : mediaNode}
        </Box>

        {featuresNode}
      </Container>
    </Box>
  );
}

export default MarketingSection;