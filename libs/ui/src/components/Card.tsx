'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  alpha,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import Image, { type StaticImageData } from 'next/image';
import NextLink from 'next/link';

export type HelixCardImageSource = string | StaticImageData;

export interface HelixCardListItem {
  text: string;
  href: string;
  target?: React.HTMLAttributeAnchorTarget;
  role?: string;
  detailedDescription?: string;
  icon?: string;
  image?: HelixCardImageSource;
}

/**
 * Backward-compatible alias.
 */
export type ListItemProps = HelixCardListItem;

export interface CardProps {
  title: string;
  description?: string;
  listItems?: HelixCardListItem[];
  image?: HelixCardImageSource;
  imageAlt?: string;
  link?: string;
  buttonText?: string;
  quote?: string;
  aspectRatio?: string;
  sx?: SxProps<Theme>;
  contentSx?: SxProps<Theme>;
}

function mergeSx(base: SxProps<Theme>, override?: SxProps<Theme>): SxProps<Theme> {
  if (!override) {
    return base;
  }

  return [
    ...(Array.isArray(base) ? base : [base]),
    ...(Array.isArray(override) ? override : [override]),
  ] as SxProps<Theme>;
}

function isInternalLink(link: string): boolean {
  return link.startsWith('/') || link.startsWith('#');
}

/**
 * HelixCard
 *
 * Reusable theme-aware info card with optional image, quote, list, and action.
 */
export function HelixCard({
  title,
  description,
  listItems,
  image,
  imageAlt,
  link,
  buttonText = `Read more about ${title}`,
  quote,
  aspectRatio = '16 / 9',
  sx,
  contentSx,
}: CardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const cardSx: SxProps<Theme> = {
    position: 'relative',
    borderRadius: 3,
    p: 3,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    bgcolor: isDark ? alpha('#FFFFFF', 0.05) : alpha('#000000', 0.04),
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: isDark
      ? '0 8px 24px rgba(0, 0, 0, 0.4)'
      : '0 8px 24px rgba(17, 25, 40, 0.15)',
    transition:
      'background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',

    '&:hover': {
      boxShadow: isDark
        ? '0 12px 32px rgba(0, 0, 0, 0.6)'
        : '0 12px 32px rgba(17, 25, 40, 0.25)',
      transform: 'translateY(-2px)',
    },
  };

  const innerContentSx: SxProps<Theme> = {
    flexGrow: 1,
    overflow: 'hidden',
    p: 2,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    mb: 2,
    textAlign: 'center',
    bgcolor: isDark ? alpha('#FFFFFF', 0.03) : alpha('#FFFFFF', 0.5),
  };

  return (
    <Box
      data-testid="helix-card"
      data-card-title={title}
      sx={mergeSx(cardSx, sx)}
    >
      <Typography
        variant="h5"
        component="h2"
        align="center"
        sx={{
          color: 'secondary.main',
          fontFamily: 'var(--font-lora, "Lora", serif)',
          mb: 2,
          fontWeight: 600,
        }}
      >
        {title}
      </Typography>

      {image ? (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            aspectRatio,
            mb: 2,
            borderRadius: theme.shape.borderRadius,
            overflow: 'hidden',
          }}
        >
          <Image
            src={image}
            alt={imageAlt ?? title}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center',
              transition: 'transform 0.3s ease',
            }}
          />
        </Box>
      ) : null}

      <Stack spacing={2} sx={mergeSx(innerContentSx, contentSx)}>
        {quote ? (
          <Typography
            variant="body1"
            color="secondary.main"
            sx={{
              fontStyle: 'italic',
              fontFamily: 'var(--font-lora, "Lora", serif)',
            }}
          >
            “{quote}”
          </Typography>
        ) : null}

        {listItems?.length ? (
          <Box sx={{ maxHeight: '12rem', overflowY: 'auto' }}>
            <List disablePadding sx={{ textAlign: 'center' }}>
              {listItems.map((item) => (
                <ListItem
                  key={`${item.href}:${item.text}`}
                  disableGutters
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    py: 0.75,
                  }}
                >
                  <Button
                    component="a"
                    href={item.href}
                    target={item.target ?? '_blank'}
                    rel={item.target === '_self' ? undefined : 'noopener noreferrer'}
                    variant="text"
                    sx={{
                      color: 'secondary.main',
                      fontFamily: 'var(--font-lora, "Lora", serif)',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': {
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    {item.icon ? `${item.icon} ` : null}
                    {item.text}
                  </Button>

                  {item.role ? (
                    <Typography variant="caption" color="text.secondary">
                      {item.role}
                    </Typography>
                  ) : null}

                  {item.detailedDescription ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ maxWidth: '100%' }}
                    >
                      {item.detailedDescription}
                    </Typography>
                  ) : null}
                </ListItem>
              ))}
            </List>
          </Box>
        ) : description ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflowY: 'auto',
              minHeight: '10.5rem',
              fontFamily: 'var(--font-lora, "Lora", serif)',
            }}
          >
            {description}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            More details coming soon.
          </Typography>
        )}
      </Stack>

      {link ? (
        <Box textAlign="center" mt="auto">
          {isInternalLink(link) ? (
            <Button
              component={NextLink as React.ElementType}
              href={link}
              variant="contained"
              color="primary"
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                fontFamily: 'var(--font-lora, "Lora", serif)',
                textTransform: 'none',
              }}
            >
              {buttonText}
            </Button>
          ) : (
            <Button
              component="a"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              color="secondary"
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                fontFamily: 'var(--font-lora, "Lora", serif)',
                textTransform: 'none',
              }}
            >
              {buttonText}
            </Button>
          )}
        </Box>
      ) : null}
    </Box>
  );
}

export default HelixCard;