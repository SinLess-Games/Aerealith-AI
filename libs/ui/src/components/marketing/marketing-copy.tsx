// libs/ui/src/components/marketing/marketing-copy.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';

import type {
  MarketingCopyAlign,
  MarketingCopyProps,
  MarketingCopyTone,
  MarketingCopyVariant,
} from '../../types';
import { mergeSx } from '../../utils';

export type {
  MarketingCopyAlign,
  MarketingCopyProps,
  MarketingCopySlotProps,
  MarketingCopyTone,
  MarketingCopyVariant
} from '../../types';

function getTextAlign(align: MarketingCopyAlign): 'left' | 'center' | 'right' {
  return align;
}

function getAlignItems(
  align: MarketingCopyAlign,
): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'left') {
    return 'flex-start';
  }

  if (align === 'right') {
    return 'flex-end';
  }

  return 'center';
}

function getJustifyContent(
  align: MarketingCopyAlign,
): 'flex-start' | 'center' | 'flex-end' {
  return getAlignItems(align);
}

function getToneColor(theme: Theme, tone: MarketingCopyTone): string {
  switch (tone) {
    case 'primary':
      return theme.palette.primary.main;

    case 'secondary':
      return theme.palette.secondary.main;

    case 'success':
      return theme.palette.success.main;

    case 'warning':
      return theme.palette.warning.main;

    case 'error':
      return theme.palette.error.main;

    case 'default':
    default:
      return theme.palette.secondary.main;
  }
}

function getDefaultSpacing(
  variant: MarketingCopyVariant,
): MarketingCopyProps['spacing'] {
  switch (variant) {
    case 'hero':
      return { xs: 2, md: 2.5 };

    case 'compact':
      return { xs: 1.25, md: 1.5 };

    case 'callout':
      return { xs: 1.5, md: 2 };

    case 'section':
    case 'default':
    default:
      return { xs: 1.5, md: 2 };
  }
}

function getDefaultMaxWidth(variant: MarketingCopyVariant): number {
  switch (variant) {
    case 'hero':
      return 1120;

    case 'compact':
      return 760;

    case 'callout':
      return 920;

    case 'section':
    case 'default':
    default:
      return 980;
  }
}

function getTitleFontSize(variant: MarketingCopyVariant) {
  switch (variant) {
    case 'hero':
      return {
        xs: '2.75rem',
        sm: '3.5rem',
        md: '4.5rem',
        lg: '5.5rem',
      };

    case 'compact':
      return {
        xs: '1.75rem',
        md: '2.35rem',
      };

    case 'callout':
      return {
        xs: '2rem',
        md: '3rem',
      };

    case 'section':
    case 'default':
    default:
      return {
        xs: '2.25rem',
        sm: '2.75rem',
        md: '3.5rem',
      };
  }
}

export function MarketingCopy({
  component = 'div',

  eyebrow,
  title,
  subtitle,
  description,
  body,
  children,
  actions,
  footnote,

  align = 'center',
  variant = 'default',
  tone = 'default',

  maxWidth,
  centered = true,
  spacing,

  titleId,
  titleComponent = 'h2',
  titleVariant = variant === 'compact' ? 'h4' : 'h2',
  subtitleVariant = 'h6',
  descriptionVariant = 'body1',

  eyebrowSx,
  titleSx,
  subtitleSx,
  descriptionSx,
  bodySx,
  actionsSx,
  footnoteSx,

  slotProps,
  sx,
  ...boxProps
}: MarketingCopyProps): React.ReactElement {
  const theme = useTheme();
  const reactId = React.useId().replace(/:/g, '');
  const resolvedTitleId =
    titleId ?? (title ? `helix-marketing-copy-${reactId}-title` : undefined);

  const toneColor = getToneColor(theme, tone);
  const textAlign = getTextAlign(align);
  const alignItems = getAlignItems(align);
  const justifyContent = getJustifyContent(align);
  const resolvedMaxWidth = maxWidth ?? getDefaultMaxWidth(variant);
  const resolvedSpacing = spacing ?? getDefaultSpacing(variant);

  const hasBody = Boolean(body || children);
  const hasHeader = Boolean(eyebrow || title || subtitle || description);

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
          maxWidth: resolvedMaxWidth,
          mx: centered ? 'auto' : undefined,
          textAlign,

          ...(variant === 'callout'
            ? {
                p: { xs: 2.5, md: 3.5 },
                borderRadius: 4,
                border: `1px solid ${alpha(toneColor, 0.26)}`,
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? alpha(toneColor, 0.08)
                    : alpha(toneColor, 0.055),
                boxShadow:
                  theme.palette.mode === 'dark'
                    ? `0 24px 72px rgba(0, 0, 0, 0.28), 0 0 24px ${alpha(
                        toneColor,
                        0.1,
                      )}`
                    : `0 24px 72px rgba(15, 23, 42, 0.1), 0 0 24px ${alpha(
                        toneColor,
                        0.08,
                      )}`,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }
            : {}),
        },
        sx,
        slotProps?.root?.sx,
      )}
    >
      <Stack
        spacing={resolvedSpacing}
        {...slotProps?.stack}
        sx={mergeSx(
          {
            alignItems,
            width: '100%',
            minWidth: 0,
          },
          slotProps?.stack?.sx,
        )}
      >
        {hasHeader ? (
          <Stack
            spacing={variant === 'compact' ? 0.75 : 1.25}
            sx={{
              alignItems,
              width: '100%',
              minWidth: 0,
            }}
          >
            {eyebrow ? (
              <Typography
                component="p"
                variant="overline"
                {...slotProps?.eyebrow}
                sx={mergeSx(
                  {
                    color: toneColor,
                    fontWeight: 900,
                    letterSpacing: '0.14em',
                    lineHeight: 1.4,
                    textTransform: 'uppercase',
                  },
                  eyebrowSx,
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
                    maxWidth: variant === 'hero' ? 1120 : 980,
                    color: 'text.primary',
                    fontWeight: 950,
                    lineHeight: variant === 'hero' ? 0.98 : 1.08,
                    letterSpacing: '-0.055em',
                    fontSize: getTitleFontSize(variant),
                    textWrap: 'balance',
                  },
                  titleSx,
                  slotProps?.title?.sx,
                )}
              >
                {title}
              </Typography>
            ) : null}

            {subtitle ? (
              <Typography
                component="p"
                variant={subtitleVariant}
                {...slotProps?.subtitle}
                sx={mergeSx(
                  {
                    maxWidth: 860,
                    color:
                      tone === 'default'
                        ? 'text.primary'
                        : alpha(toneColor, theme.palette.mode === 'dark' ? 0.9 : 0.86),
                    fontWeight: 800,
                    lineHeight: 1.45,
                    textWrap: 'balance',
                  },
                  subtitleSx,
                  slotProps?.subtitle?.sx,
                )}
              >
                {subtitle}
              </Typography>
            ) : null}

            {description ? (
              <Typography
                component="p"
                variant={descriptionVariant}
                {...slotProps?.description}
                sx={mergeSx(
                  {
                    maxWidth: variant === 'hero' ? 940 : 820,
                    color: 'text.secondary',
                    fontSize:
                      variant === 'hero'
                        ? { xs: '1.05rem', md: '1.2rem' }
                        : { xs: '1rem', md: '1.075rem' },
                    lineHeight: 1.8,
                    textWrap: 'pretty',
                  },
                  descriptionSx,
                  slotProps?.description?.sx,
                )}
              >
                {description}
              </Typography>
            ) : null}
          </Stack>
        ) : null}

        {hasBody ? (
          <Box
            {...slotProps?.body}
            sx={mergeSx(
              {
                width: '100%',
                maxWidth: 860,
                color: 'text.secondary',
                fontSize: { xs: '1rem', md: '1.05rem' },
                lineHeight: 1.8,

                '& p': {
                  mt: 0,
                },

                '& p:last-child': {
                  mb: 0,
                },

                '& strong': {
                  color: 'text.primary',
                  fontWeight: 800,
                },

                '& a': {
                  color: toneColor,
                  fontWeight: 800,
                  textDecoration: 'none',
                },

                '& a:hover': {
                  textDecoration: 'underline',
                },
              },
              bodySx,
              slotProps?.body?.sx,
            )}
          >
            {body ?? children}
          </Box>
        ) : null}

        {actions ? (
          <Box
            {...slotProps?.actions}
            sx={mergeSx(
              {
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.25,
                justifyContent,
                pt: hasHeader || hasBody ? 0.75 : 0,
              },
              actionsSx,
              slotProps?.actions?.sx,
            )}
          >
            {actions}
          </Box>
        ) : null}

        {footnote ? (
          <Typography
            component="p"
            variant="caption"
            {...slotProps?.footnote}
            sx={mergeSx(
              {
                maxWidth: 760,
                color: 'text.secondary',
                opacity: 0.78,
                lineHeight: 1.65,
              },
              footnoteSx,
              slotProps?.footnote?.sx,
            )}
          >
            {footnote}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export default MarketingCopy;
