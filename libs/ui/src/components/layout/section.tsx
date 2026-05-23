'use client';

// libs/ui/src/components/layout/section.tsx
import * as React from 'react';

import {
  Box,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

import type {
  SectionAlign,
  SectionMediaPosition,
  SectionProps,
  SectionSpacing,
  SectionVariant,
} from '../../types/section';
import { mergeSx } from '../../utils';

export type {
  SectionAlign,
  SectionMediaPosition,
  SectionProps,
  SectionSlotProps,
  SectionSpacing,
  SectionVariant,
} from '../../types/section';

const spacingYMap: Record<SectionSpacing, SxProps<Theme>> = {
  none: {
    py: 0,
  },
  compact: {
    py: { xs: 4, md: 6, lg: 8 },
  },
  normal: {
    py: { xs: 7, md: 10, lg: 12 },
  },
  spacious: {
    py: { xs: 9, md: 13, lg: 16 },
  },
};

function getVariantSx(variant: SectionVariant): SxProps<Theme> {
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
        bgcolor: alpha('#050716', 0.42),
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 10% 10%, rgba(0, 219, 255, 0.12), transparent 28%), radial-gradient(circle at 88% 18%, rgba(246, 6, 111, 0.14), transparent 34%)',
        },
      };

    case 'gradient':
      return {
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
        background:
          'linear-gradient(135deg, rgba(2, 19, 37, 0.92), rgba(17, 15, 48, 0.84), rgba(35, 11, 58, 0.86))',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 8% 12%, rgba(0, 219, 255, 0.16), transparent 32%), radial-gradient(circle at 78% 18%, rgba(246, 6, 111, 0.18), transparent 34%)',
        },
      };

    case 'default':
    default:
      return {
        bgcolor: 'transparent',
      };
  }
}

function getJustifyContent(align: SectionAlign): string {
  if (align === 'center') {
    return 'center';
  }

  if (align === 'right') {
    return 'flex-end';
  }

  return 'flex-start';
}

function getTextAlign(align: SectionAlign): 'left' | 'center' | 'right' {
  return align;
}

function isSideMedia(position: SectionMediaPosition): boolean {
  return position === 'left' || position === 'right';
}

function shouldRenderBeforeContent(position: SectionMediaPosition): boolean {
  return position === 'left' || position === 'top';
}

export function Section({
  component = 'section',
  id,
  eyebrow,
  title,
  description,
  children,
  media,
  mediaPosition = 'right',
  actions,
  maxContentWidth = 1900,
  maxTextWidth = 760,
  maxTextOnlyWidth = 1120,
  mediaGridColumns = ['minmax(0, 0.92fr)', 'minmax(0, 1.08fr)'],
  mediaBreakpoint = 'lg',
  align = 'left',
  variant = 'default',
  spacingY = 'normal',
  spacing = { xs: 2.25, md: 3 },
  fullHeight = false,
  centerContent = true,
  mediaFirstOnMobile = false,
  titleId,
  titleComponent = 'h2',
  titleVariant = 'h2',
  slotProps,
  sx,
  ...sectionProps
}: SectionProps): React.ReactElement {
  const reactId = React.useId().replace(/:/g, '');

  const hasHeader = Boolean(eyebrow || title || description);
  const hasMedia = Boolean(media);
  const sideMedia = hasMedia && isSideMedia(mediaPosition);
  const alignedCenter = align === 'center';

  const resolvedTitleId =
    titleId ?? (id ? `${id}-title` : `helix-section-${reactId}-title`);

  const sectionLabelledBy =
    sectionProps['aria-labelledby'] ?? (title ? resolvedTitleId : undefined);

  const sideMediaColumns = `${mediaGridColumns[0]} ${mediaGridColumns[1]}`;

  const contentDesktopOrder = mediaPosition === 'left' ? 2 : 1;
  const mediaDesktopOrder = mediaPosition === 'left' ? 1 : 2;

  const contentMobileOrder = mediaFirstOnMobile ? 2 : 1;
  const mediaMobileOrder = mediaFirstOnMobile ? 1 : 2;

  const variantSx = getVariantSx(variant);

  const headerAlignItems = getJustifyContent(align);
  const textAlign = getTextAlign(align);

  const resolvedContentMaxWidth = hasMedia ? maxTextWidth : maxTextOnlyWidth;

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
          minWidth: 0,
        },
        slotProps?.media?.sx,
      )}
    >
      {media}
    </Box>
  ) : null;

  const contentNode = (
    <Stack
      spacing={spacing}
      {...slotProps?.content}
      sx={mergeSx(
        {
          order: sideMedia
            ? {
                xs: contentMobileOrder,
                [mediaBreakpoint]: contentDesktopOrder,
              }
            : undefined,
          alignItems: headerAlignItems,
          textAlign,
          width: '100%',
          maxWidth: resolvedContentMaxWidth,
          mx: alignedCenter && !sideMedia ? 'auto' : undefined,
          minWidth: 0,
        },
        slotProps?.content?.sx,
      )}
    >
      {hasHeader ? (
        <Stack
          spacing={{ xs: 1.5, md: 2 }}
          {...slotProps?.header}
          sx={mergeSx(
            {
              alignItems: headerAlignItems,
              textAlign,
              width: '100%',
            },
            slotProps?.header?.sx,
          )}
        >
          {eyebrow ? (
            <Typography
              component="p"
              variant="overline"
              {...slotProps?.eyebrow}
              sx={mergeSx(
                {
                  width: '100%',
                  color: variant === 'gradient' ? '#8be9ff' : 'primary.main',
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  lineHeight: 1.4,
                },
                slotProps?.eyebrow?.sx,
              )}
            >
              {eyebrow}
            </Typography>
          ) : null}

          {title ? (
            <Typography
              id={resolvedTitleId}
              component={titleComponent}
              variant={titleVariant}
              {...slotProps?.title}
              sx={mergeSx(
                {
                  width: '100%',
                  maxWidth: '100%',
                  color: variant === 'gradient' ? '#ffffff' : 'text.primary',
                  fontWeight: 900,
                  lineHeight: 1.05,
                  letterSpacing: '-0.045em',
                  fontSize: {
                    xs: '2.35rem',
                    sm: '3rem',
                    md: '4rem',
                    lg: '4.75rem',
                  },
                  textShadow:
                    variant === 'gradient'
                      ? '0 0 26px rgba(246, 6, 111, 0.24)'
                      : undefined,
                },
                slotProps?.title?.sx,
              )}
            >
              {title}
            </Typography>
          ) : null}

          {description ? (
            <Typography
              component="p"
              variant="body1"
              {...slotProps?.description}
              sx={mergeSx(
                {
                  width: '100%',
                  maxWidth: '100%',
                  color:
                    variant === 'gradient'
                      ? 'rgba(205, 222, 241, 0.86)'
                      : 'text.secondary',
                  fontSize: { xs: '1rem', md: '1.125rem' },
                  lineHeight: 1.8,
                },
                slotProps?.description?.sx,
              )}
            >
              {description}
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {actions ? (
        <Box
          {...slotProps?.actions}
          sx={mergeSx(
            {
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1.5,
              justifyContent: headerAlignItems,
              pt: hasHeader ? { xs: 0.5, md: 1 } : 0,
            },
            slotProps?.actions?.sx,
          )}
        >
          {actions}
        </Box>
      ) : null}

      {children ? (
        <Box
          {...slotProps?.body}
          sx={mergeSx(
            {
              width: '100%',
              pt: hasHeader || actions ? { xs: 1, md: 1.5 } : 0,
            },
            slotProps?.body?.sx,
          )}
        >
          {children}
        </Box>
      ) : null}
    </Stack>
  );

  return (
    <Box
      id={id}
      component={component}
      aria-labelledby={sectionLabelledBy}
      sx={mergeSx(
        {
          width: '100%',
          minHeight: fullHeight ? '100dvh' : undefined,
        },
        spacingYMap[spacingY],
        variantSx,
        sx,
      )}
      {...sectionProps}
    >
      <Container
        maxWidth={false}
        {...slotProps?.container}
        sx={mergeSx(
          {
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: maxContentWidth,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4, lg: 6 },
          },
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
                    [mediaBreakpoint]: sideMediaColumns,
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
            slotProps?.inner?.sx,
          )}
        >
          {shouldRenderBeforeContent(mediaPosition) ? mediaNode : null}
          {contentNode}
          {shouldRenderBeforeContent(mediaPosition) ? null : mediaNode}
        </Box>
      </Container>
    </Box>
  );
}

export default Section;