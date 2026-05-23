'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
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
import Image from 'next/image';
import NextLink from 'next/link';

import type {
  HelixCardAction,
  HelixCardListItem,
  HelixCardProps,
  HelixCardVariant,
  ListItemProps,
} from '../../types/card';
import { mergeSx } from '../../utils';

function isInternalLink(link: string): boolean {
  return (
    link.startsWith('/') ||
    link.startsWith('#') ||
    link.startsWith('?') ||
    link.startsWith('./') ||
    link.startsWith('../')
  );
}

function isExternalLink(link: string): boolean {
  return /^(https?:)?\/\//i.test(link);
}

function getNodeText(value: React.ReactNode): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function getActionRel(
  href: string | undefined,
  target: React.HTMLAttributeAnchorTarget | undefined,
  rel: string | undefined,
): string | undefined {
  if (rel) {
    return rel;
  }

  if (href && isExternalLink(href) && target !== '_self') {
    return 'noopener noreferrer';
  }

  return undefined;
}

function getActionTarget(
  href: string | undefined,
  target: React.HTMLAttributeAnchorTarget | undefined,
): React.HTMLAttributeAnchorTarget | undefined {
  if (target) {
    return target;
  }

  if (href && isExternalLink(href)) {
    return '_blank';
  }

  return undefined;
}

function buildActionFromLegacyProps({
  link,
  buttonText,
  title,
}: {
  link?: string;
  buttonText?: React.ReactNode;
  title?: React.ReactNode;
}): HelixCardAction[] {
  if (!link) {
    return [];
  }

  const readableTitle = getNodeText(title);

  return [
    {
      label:
        buttonText ??
        (readableTitle ? `Read more about ${readableTitle}` : 'Read more'),
      href: link,
      variant: 'contained',
      color: isExternalLink(link) ? 'secondary' : 'primary',
    },
  ];
}

function renderActionButton(
  action: HelixCardAction,
  index: number,
  buttonSx: SxProps<Theme>,
): React.ReactElement {
  const key = `${getNodeText(action.label) ?? 'action'}-${index}`;
  const target = getActionTarget(action.href, action.target);
  const rel = getActionRel(action.href, target, action.rel);
  const variant = action.variant ?? 'contained';
  const color = action.color ?? 'primary';
  const sx = mergeSx(buttonSx, action.buttonProps?.sx);

  if (action.href && isInternalLink(action.href)) {
    return (
      <Button
        key={key}
        component={NextLink as React.ElementType}
        href={action.href}
        target={target}
        rel={rel}
        disabled={action.disabled}
        variant={variant}
        color={color}
        startIcon={action.startIcon}
        endIcon={action.endIcon}
        onClick={
          action.onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
        }
        {...action.buttonProps}
        sx={sx}
      >
        {action.label}
      </Button>
    );
  }

  if (action.href) {
    return (
      <Button
        key={key}
        component="a"
        href={action.href}
        target={target}
        rel={rel}
        disabled={action.disabled}
        variant={variant}
        color={color}
        startIcon={action.startIcon}
        endIcon={action.endIcon}
        onClick={
          action.onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
        }
        {...action.buttonProps}
        sx={sx}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      key={key}
      disabled={action.disabled}
      variant={variant}
      color={color}
      startIcon={action.startIcon}
      endIcon={action.endIcon}
      onClick={
        action.onClick as React.MouseEventHandler<HTMLButtonElement> | undefined
      }
      {...action.buttonProps}
      sx={sx}
    >
      {action.label}
    </Button>
  );
}

function renderListItemButton(
  item: HelixCardListItem,
  index: number,
  buttonSx: SxProps<Theme>,
): React.ReactElement {
  const key = item.id ?? `${getNodeText(item.text) ?? 'item'}-${index}`;
  const target = getActionTarget(item.href, item.target);
  const rel = getActionRel(item.href, target, item.rel);

  const buttonContent = (
    <>
      {item.icon ? (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
            mr: 0.75,
          }}
        >
          {item.icon}
        </Box>
      ) : null}

      {item.text}
    </>
  );

  if (item.href && isInternalLink(item.href)) {
    return (
      <Button
        key={key}
        component={NextLink as React.ElementType}
        href={item.href}
        target={target}
        rel={rel}
        onClick={
          item.onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
        }
        disabled={item.disabled}
        variant="text"
        sx={buttonSx}
      >
        {buttonContent}
      </Button>
    );
  }

  if (item.href) {
    return (
      <Button
        key={key}
        component="a"
        href={item.href}
        target={target}
        rel={rel}
        onClick={
          item.onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
        }
        disabled={item.disabled}
        variant="text"
        sx={buttonSx}
      >
        {buttonContent}
      </Button>
    );
  }

  return (
    <Button
      key={key}
      onClick={
        item.onClick as React.MouseEventHandler<HTMLButtonElement> | undefined
      }
      disabled={item.disabled}
      variant="text"
      sx={buttonSx}
    >
      {buttonContent}
    </Button>
  );
}

/**
 * HelixCard
 *
 * Reusable theme-aware card with optional media, quote, list items,
 * children, footer content, and one or more actions.
 */
export function HelixCard({
  eyebrow,
  title,
  subtitle,
  description,
  children,
  footer,
  listItems,
  actions,
  image,
  imageAlt,
  imagePriority = false,
  imageSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px',
  imageProps,
  media,
  mediaPlacement = 'top',
  mediaWidth = '42%',
  aspectRatio = '16 / 9',
  objectFit = 'cover',
  objectPosition = 'center',
  link,
  buttonText,
  quote,
  variant = 'glass',
  align = 'center',
  fullHeight = true,
  hoverable = true,
  clickable = false,
  maxWidth,
  sx,
  rootSx,
  mediaSx,
  contentSx,
  headerSx,
  titleSx,
  descriptionSx,
  footerSx,
  slotProps,
}: HelixCardProps): React.ReactElement {
  const theme = useTheme();
  const titleId = React.useId();
  const isDark = theme.palette.mode === 'dark';
  const readableTitle = getNodeText(title);
  const hasMedia = Boolean(media || image);
  const isHorizontal =
    hasMedia && (mediaPlacement === 'left' || mediaPlacement === 'right');
  const hasHeader = Boolean(eyebrow || title || subtitle);
  const hasBody = Boolean(quote || description || children || listItems?.length);

  const resolvedActions =
    actions && actions.length > 0
      ? [...actions]
      : buildActionFromLegacyProps({ link, buttonText, title });

  const cardBackground = {
    glass: isDark ? alpha('#ffffff', 0.055) : alpha('#ffffff', 0.72),
    elevated: isDark ? alpha('#111827', 0.92) : '#ffffff',
    outlined: 'transparent',
    plain: 'transparent',
  } satisfies Record<HelixCardVariant, string>;

  const cardBorder = {
    glass: `1px solid ${
      isDark ? alpha('#ffffff', 0.13) : alpha('#0f172a', 0.08)
    }`,
    elevated: `1px solid ${
      isDark ? alpha('#ffffff', 0.1) : alpha('#0f172a', 0.08)
    }`,
    outlined: `1px solid ${theme.palette.divider}`,
    plain: '1px solid transparent',
  } satisfies Record<HelixCardVariant, string>;

  const cardShadow = {
    glass: isDark
      ? '0 20px 68px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
      : '0 20px 68px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    elevated: isDark
      ? '0 18px 54px rgba(0, 0, 0, 0.42)'
      : '0 18px 54px rgba(15, 23, 42, 0.14)',
    outlined: 'none',
    plain: 'none',
  } satisfies Record<HelixCardVariant, string>;

  const rootStyles: SxProps<Theme> = {
    position: 'relative',
    width: '100%',
    maxWidth,
    height: fullHeight ? '100%' : undefined,
    overflow: 'hidden',
    borderRadius: 4,
    color: 'text.primary',
    bgcolor: cardBackground[variant],
    border: cardBorder[variant],
    boxShadow: cardShadow[variant],
    backdropFilter:
      variant === 'glass' ? 'blur(18px) saturate(170%)' : undefined,
    WebkitBackdropFilter:
      variant === 'glass' ? 'blur(18px) saturate(170%)' : undefined,
    transition:
      'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease',

    ...(hoverable
      ? {
          '&:hover': {
            transform: 'translateY(-3px)',
            borderColor: alpha(theme.palette.secondary.main, 0.42),
            boxShadow: isDark
              ? '0 26px 78px rgba(0, 0, 0, 0.5), 0 0 26px rgba(246, 6, 111, 0.14)'
              : '0 26px 78px rgba(15, 23, 42, 0.18), 0 0 26px rgba(246, 6, 111, 0.1)',
          },
        }
      : {}),

    ...(clickable && link
      ? {
          cursor: 'pointer',
        }
      : {}),
  };

  const layoutStyles: SxProps<Theme> = {
    display: isHorizontal ? 'grid' : 'flex',
    gridTemplateColumns: isHorizontal
      ? {
          xs: '1fr',
          md:
            mediaPlacement === 'left'
              ? `${mediaWidth} minmax(0, 1fr)`
              : `minmax(0, 1fr) ${mediaWidth}`,
        }
      : undefined,
    flexDirection: isHorizontal ? undefined : 'column',
    minHeight: fullHeight ? '100%' : undefined,
  };

  const mediaStyles: SxProps<Theme> = {
    position: 'relative',
    width: '100%',
    minHeight: isHorizontal ? { xs: undefined, md: '100%' } : undefined,
    aspectRatio: isHorizontal ? { xs: aspectRatio, md: 'auto' } : aspectRatio,
    overflow: 'hidden',
    bgcolor: isDark ? alpha('#000000', 0.22) : alpha('#000000', 0.04),

    '& img': {
      transition: 'transform 260ms ease',
    },

    ...(hoverable
      ? {
          '.MuiCard-root:hover & img': {
            transform: 'scale(1.035)',
          },
        }
      : {}),
  };

  const contentStyles: SxProps<Theme> = {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: 2,
    p: { xs: 2.5, sm: 3 },
    textAlign: align,
  };

  const titleStyles: SxProps<Theme> = {
    color: 'text.primary',
    fontFamily: 'var(--font-lora, "Lora", serif)',
    fontWeight: 800,
    lineHeight: 1.12,
    letterSpacing: '-0.025em',
  };

  const descriptionStyles: SxProps<Theme> = {
    color: 'text.secondary',
    lineHeight: 1.75,
    fontFamily: 'var(--font-lora, "Lora", serif)',
  };

  const actionButtonSx: SxProps<Theme> = {
    px: 2.75,
    py: 0.95,
    borderRadius: 999,
    fontFamily: 'var(--font-lora, "Lora", serif)',
    fontWeight: 800,
    textTransform: 'none',
    boxShadow:
      '0 0 18px rgba(246, 6, 111, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  };

  const listButtonSx: SxProps<Theme> = {
    justifyContent: align === 'center' ? 'center' : 'flex-start',
    px: 1,
    py: 0.5,
    minWidth: 0,
    color: 'secondary.main',
    fontFamily: 'var(--font-lora, "Lora", serif)',
    textTransform: 'none',
    fontWeight: 700,
    textAlign: align,

    '&:hover': {
      bgcolor: alpha(theme.palette.secondary.main, 0.08),
      textDecoration: 'underline',
    },
  };

  const renderedMedia = hasMedia ? (
    <Box
      {...slotProps?.media}
      sx={mergeSx(mediaStyles, mediaSx, slotProps?.media?.sx)}
    >
      {media ??
        (image ? (
          <Image
            src={image}
            alt={imageAlt ?? readableTitle ?? 'Card image'}
            fill
            priority={imagePriority}
            sizes={imageSizes}
            {...imageProps}
            style={{
              objectFit,
              objectPosition,
              ...imageProps?.style,
            }}
          />
        ) : null)}
    </Box>
  ) : null;

  const renderedHeader = hasHeader ? (
    <Box
      {...slotProps?.header}
      sx={mergeSx(
        {
          display: 'grid',
          gap: 0.75,
          justifyItems:
            align === 'center'
              ? 'center'
              : align === 'right'
                ? 'flex-end'
                : 'flex-start',
        },
        headerSx,
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
              color: 'secondary.main',
              fontWeight: 900,
              letterSpacing: '0.14em',
              lineHeight: 1.25,
            },
            slotProps?.eyebrow?.sx,
          )}
        >
          {eyebrow}
        </Typography>
      ) : null}

      {title ? (
        <Typography
          id={titleId}
          component="h2"
          variant="h5"
          {...slotProps?.title}
          sx={mergeSx(titleStyles, titleSx, slotProps?.title?.sx)}
        >
          {title}
        </Typography>
      ) : null}

      {subtitle ? (
        <Typography
          component="p"
          variant="body2"
          {...slotProps?.subtitle}
          sx={mergeSx(
            {
              color: 'text.secondary',
              fontWeight: 600,
              lineHeight: 1.6,
            },
            slotProps?.subtitle?.sx,
          )}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  ) : null;

  const renderedList = listItems?.length ? (
    <List
      disablePadding
      {...slotProps?.list}
      sx={mergeSx(
        {
          display: 'grid',
          gap: 0.75,
          textAlign: align,
        },
        slotProps?.list?.sx,
      )}
    >
      {listItems.map((item: ListItemProps, index) => (
        <ListItem
          key={item.id ?? `${getNodeText(item.text) ?? 'item'}-${index}`}
          disableGutters
          sx={{
            display: 'grid',
            gap: 0.35,
            justifyItems:
              align === 'center'
                ? 'center'
                : align === 'right'
                  ? 'flex-end'
                  : 'flex-start',
            py: 0.5,
          }}
        >
          {item.image ? (
            <Box
              sx={{
                position: 'relative',
                width: 38,
                height: 38,
                overflow: 'hidden',
                borderRadius: 2,
                mb: 0.35,
              }}
            >
              <Image
                src={item.image}
                alt={item.imageAlt ?? getNodeText(item.text) ?? 'List item'}
                fill
                sizes="38px"
                style={{
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </Box>
          ) : null}

          {renderListItemButton(item, index, listButtonSx)}

          {item.role ? (
            <Typography variant="caption" color="text.secondary">
              {item.role}
            </Typography>
          ) : null}

          {item.detailedDescription ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                maxWidth: '100%',
                lineHeight: 1.55,
              }}
            >
              {item.detailedDescription}
            </Typography>
          ) : null}
        </ListItem>
      ))}
    </List>
  ) : null;

  const renderedBody = hasBody ? (
    <Stack spacing={1.75} sx={{ flexGrow: 1 }}>
      {quote ? (
        <Typography
          variant="body1"
          color="secondary.main"
          sx={{
            fontStyle: 'italic',
            fontFamily: 'var(--font-lora, "Lora", serif)',
            lineHeight: 1.7,
          }}
        >
          “{quote}”
        </Typography>
      ) : null}

      {description ? (
        <Typography
          component="div"
          variant="body2"
          {...slotProps?.description}
          sx={mergeSx(
            descriptionStyles,
            descriptionSx,
            slotProps?.description?.sx,
          )}
        >
          {description}
        </Typography>
      ) : null}

      {renderedList}

      {children ? <Box sx={{ width: '100%' }}>{children}</Box> : null}
    </Stack>
  ) : (
    <Typography variant="body2" color="text.secondary">
      More details coming soon.
    </Typography>
  );

  const renderedFooter =
    footer || resolvedActions.length ? (
      <Box
        {...slotProps?.footer}
        sx={mergeSx(
          {
            display: 'grid',
            gap: 1.5,
            mt: 'auto',
            pt: 1,
          },
          footerSx,
          slotProps?.footer?.sx,
        )}
      >
        {footer ? <Box>{footer}</Box> : null}

        {resolvedActions.length ? (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            justifyContent={
              align === 'center'
                ? 'center'
                : align === 'right'
                  ? 'flex-end'
                  : 'flex-start'
            }
          >
            {resolvedActions.map((action, index) =>
              renderActionButton(action, index, actionButtonSx),
            )}
          </Stack>
        ) : null}
      </Box>
    ) : null;

  const cardContent = (
    <Box sx={layoutStyles}>
      {mediaPlacement === 'top' || mediaPlacement === 'left'
        ? renderedMedia
        : null}

      <CardContent
        {...slotProps?.content}
        sx={mergeSx(contentStyles, contentSx, slotProps?.content?.sx)}
      >
        {renderedHeader}

        {renderedHeader && hasBody ? (
          <Divider
            sx={{
              borderColor: alpha(theme.palette.divider, isDark ? 0.65 : 1),
            }}
          />
        ) : null}

        {renderedBody}

        {renderedFooter}
      </CardContent>

      {mediaPlacement === 'bottom' || mediaPlacement === 'right'
        ? renderedMedia
        : null}
    </Box>
  );

  return (
    <MuiCard
      data-testid="helix-card"
      data-card-title={readableTitle}
      aria-labelledby={title ? titleId : undefined}
      elevation={0}
      {...slotProps?.root}
      sx={mergeSx(rootStyles, rootSx, sx, slotProps?.root?.sx)}
      onClick={
        clickable && link
          ? () => {
              window.location.assign(link);
            }
          : slotProps?.root?.onClick
      }
    >
      {cardContent}
    </MuiCard>
  );
}

export default HelixCard;