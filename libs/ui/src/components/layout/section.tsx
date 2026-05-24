'use client';

// libs/ui/src/components/layout/section.tsx

import * as React from 'react';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
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
  return (theme) => {
    const isDark = theme.palette.mode === 'dark';

    switch (variant) {
      case 'plain':
        return {
          bgcolor: 'transparent',
          color: theme.palette.text.primary,
        };

      case 'surface':
        return {
          position: 'relative',
          overflow: 'hidden',
          color: theme.palette.text.primary,
          bgcolor: theme.palette.background.paper,
          borderBlock: `1px solid ${alpha(theme.palette.divider, isDark ? 0.72 : 1)}`,
          boxShadow: isDark
            ? `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.04)}`
            : theme.shadows[1],
        };

      case 'glass':
        return {
          position: 'relative',
          overflow: 'hidden',
          color: theme.palette.text.primary,
          bgcolor: alpha(theme.palette.background.paper, isDark ? 0.54 : 0.72),
          borderBlock: `1px solid ${alpha(theme.palette.divider, isDark ? 0.58 : 0.9)}`,
          boxShadow: isDark
            ? `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.06)}, 0 18px 56px ${alpha(theme.palette.common.black, 0.28)}`
            : `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.78)}, 0 18px 48px ${alpha(theme.palette.common.black, 0.08)}`,
          backdropFilter: 'saturate(175%) blur(18px)',
          WebkitBackdropFilter: 'saturate(175%) blur(18px)',

          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: [
              `radial-gradient(circle at 10% 10%, ${alpha(theme.palette.secondary.main, isDark ? 0.16 : 0.1)}, transparent 30%)`,
              `radial-gradient(circle at 88% 18%, ${alpha(theme.palette.primary.main, isDark ? 0.18 : 0.1)}, transparent 34%)`,
              `linear-gradient(135deg, ${alpha(theme.palette.background.default, isDark ? 0.12 : 0.22)}, transparent 55%)`,
            ].join(', '),
          },

          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: isDark ? 0.42 : 0.28,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
            maskImage:
              'linear-gradient(to bottom, transparent, black 18%, black 78%, transparent)',
          },
        };

      case 'gradient':
        return {
          position: 'relative',
          overflow: 'hidden',
          color: theme.palette.common.white,
          backgroundColor: theme.palette.background.default,
          backgroundImage: isDark
            ? [
                `radial-gradient(circle at 8% 12%, ${alpha(theme.palette.secondary.main, 0.2)}, transparent 34%)`,
                `radial-gradient(circle at 82% 18%, ${alpha(theme.palette.primary.main, 0.24)}, transparent 36%)`,
                `linear-gradient(135deg, ${alpha(theme.palette.background.default, 0.96)}, ${alpha(theme.palette.primary.dark ?? theme.palette.primary.main, 0.72)}, ${alpha(theme.palette.secondary.dark ?? theme.palette.secondary.main, 0.42)})`,
              ].join(', ')
            : [
                `radial-gradient(circle at 8% 12%, ${alpha(theme.palette.secondary.main, 0.16)}, transparent 34%)`,
                `radial-gradient(circle at 82% 18%, ${alpha(theme.palette.primary.main, 0.18)}, transparent 36%)`,
                `linear-gradient(135deg, ${theme.palette.background.paper}, ${alpha(theme.palette.primary.main, 0.2)}, ${alpha(theme.palette.secondary.main, 0.14)})`,
              ].join(', '),
          borderBlock: `1px solid ${alpha(theme.palette.divider, isDark ? 0.5 : 0.9)}`,

          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `linear-gradient(90deg, transparent 0%, ${alpha(
              theme.palette.primary.main,
              isDark ? 0.16 : 0.08,
            )} 28%, ${alpha(
              theme.palette.secondary.main,
              isDark ? 0.18 : 0.1,
            )} 72%, transparent 100%)`,
          },

          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: isDark ? 0.38 : 0.18,
            backgroundImage:
              'radial-gradient(circle at center, rgba(255,255,255,0.18) 0 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage:
              'linear-gradient(to bottom, transparent, black 20%, black 76%, transparent)',
          },
        };

      case 'default':
      default:
        return {
          bgcolor: 'transparent',
          color: theme.palette.text.primary,
        };
    }
  };
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
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',

          '& img': {
            width: '100%',
            height: 'auto',
            display: 'block',
            objectFit: 'contain',
            objectPosition: 'top center',
          },

          '& video': {
            width: '100%',
            height: 'auto',
            display: 'block',
            objectFit: 'contain',
            objectPosition: 'top center',
          },

          '& picture': {
            width: '100%',
            display: 'block',
          },
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
                (theme) => ({
                  width: '100%',
                  color:
                    variant === 'gradient'
                      ? theme.palette.secondary.light ??
                        theme.palette.secondary.main
                      : theme.palette.secondary.main,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  lineHeight: 1.4,
                  textShadow:
                    variant === 'gradient'
                      ? `0 0 18px ${alpha(theme.palette.secondary.main, 0.35)}`
                      : undefined,
                }),
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
                (theme) => ({
                  width: '100%',
                  maxWidth: '100%',
                  color:
                    variant === 'gradient'
                      ? theme.palette.common.white
                      : theme.palette.text.primary,
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
                    variant === 'gradient' || variant === 'glass'
                      ? `0 0 28px ${alpha(theme.palette.primary.main, 0.26)}`
                      : undefined,
                }),
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
                (theme) => ({
                  width: '100%',
                  maxWidth: '100%',
                  color:
                    variant === 'gradient'
                      ? alpha(theme.palette.common.white, 0.78)
                      : theme.palette.text.secondary,
                  fontSize: { xs: '1rem', md: '1.125rem' },
                  lineHeight: 1.8,
                }),
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
              width: '100%',
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
