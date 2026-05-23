import type {
  CSSProperties,
  ElementType,
  HTMLAttributeAnchorTarget,
  MouseEventHandler,
  ReactNode,
} from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { ButtonProps } from '@mui/material/Button';
import type { CardProps as MuiCardProps } from '@mui/material/Card';
import type { CardContentProps } from '@mui/material/CardContent';
import type { ListProps } from '@mui/material/List';
import type { SxProps, Theme } from '@mui/material/styles';
import type { TypographyProps } from '@mui/material/Typography';
import type {
  ImageProps as NextImageProps,
  StaticImageData,
} from 'next/image';

export type HelixCardImageSource = string | StaticImageData;

export type HelixCardVariant = 'glass' | 'elevated' | 'outlined' | 'plain';

export type HelixCardMediaPlacement = 'top' | 'bottom' | 'left' | 'right';

export type HelixCardTextAlign = 'left' | 'center' | 'right';

export interface HelixCardListItem {
  id?: string;
  text: ReactNode;
  href?: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  role?: ReactNode;
  detailedDescription?: ReactNode;
  icon?: ReactNode;
  image?: HelixCardImageSource;
  imageAlt?: string;
  disabled?: boolean;
}

/**
 * Backward-compatible alias.
 */
export type ListItemProps = HelixCardListItem;

export interface HelixCardAction {
  label: ReactNode;
  href?: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  buttonProps?: Omit<
    ButtonProps,
    | 'children'
    | 'href'
    | 'target'
    | 'rel'
    | 'onClick'
    | 'disabled'
    | 'variant'
    | 'color'
    | 'startIcon'
    | 'endIcon'
  >;
}

export interface HelixCardSlotProps {
  root?: Partial<MuiCardProps>;
  media?: Partial<BoxProps>;
  content?: Partial<CardContentProps>;
  header?: Partial<BoxProps>;
  eyebrow?: Partial<TypographyProps>;
  title?: Partial<TypographyProps>;
  subtitle?: Partial<TypographyProps>;
  description?: Partial<TypographyProps>;
  list?: Partial<ListProps>;
  footer?: Partial<BoxProps>;
}

export interface HelixCardProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;

  listItems?: readonly HelixCardListItem[];
  actions?: readonly HelixCardAction[];

  image?: HelixCardImageSource;
  imageAlt?: string;
  imagePriority?: boolean;
  imageSizes?: string;
  imageProps?: Omit<
    NextImageProps,
    | 'src'
    | 'alt'
    | 'fill'
    | 'width'
    | 'height'
    | 'priority'
    | 'sizes'
  >;

  /**
   * Custom media slot for videos, screenshots, demos, illustrations,
   * carousels, etc.
   *
   * If provided, this renders instead of `image`.
   */
  media?: ReactNode;

  mediaPlacement?: HelixCardMediaPlacement;
  mediaWidth?: string | number;
  aspectRatio?: string | number;
  objectFit?: CSSProperties['objectFit'];
  objectPosition?: CSSProperties['objectPosition'];

  /**
   * Backward-compatible single action props.
   */
  link?: string;
  buttonText?: ReactNode;

  quote?: ReactNode;

  variant?: HelixCardVariant;
  align?: HelixCardTextAlign;
  fullHeight?: boolean;
  hoverable?: boolean;
  clickable?: boolean;

  maxWidth?: string | number;

  sx?: SxProps<Theme>;
  rootSx?: SxProps<Theme>;
  mediaSx?: SxProps<Theme>;
  contentSx?: SxProps<Theme>;
  headerSx?: SxProps<Theme>;
  titleSx?: SxProps<Theme>;
  descriptionSx?: SxProps<Theme>;
  footerSx?: SxProps<Theme>;

  slotProps?: HelixCardSlotProps;
}

/**
 * Backward-compatible alias.
 */
export type CardProps = HelixCardProps;

export type GlassCardTone =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error';

export type GlassCardPadding = 'none' | 'compact' | 'normal' | 'comfortable';

export type GlassCardRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface GlassCardProps
  extends Omit<BoxProps, 'children' | 'component' | 'sx'> {
  /** The main content of the card. */
  children: ReactNode;

  /** The root component type, for example: section, article, aside. */
  component?: ElementType;

  /** Additional system styling overrides. */
  sx?: SxProps<Theme>;

  /** Optional system styling for the inner content wrapper. */
  contentSx?: SxProps<Theme>;

  /** Visual accent tone. */
  tone?: GlassCardTone;

  /** Controls the internal padding. */
  padding?: GlassCardPadding;

  /** Controls border radius. */
  radius?: GlassCardRadius;

  /** Optional elevation toggle for subtle shadow depth. */
  elevated?: boolean;

  /** Enables hover lift/shine treatment. */
  hoverable?: boolean;

  /** Enables a soft outer glow based on the tone. */
  glow?: boolean;

  /** Enables/disables the glass border. */
  bordered?: boolean;

  /** Enables/disables backdrop blur. */
  blur?: boolean;

  /** Makes the card fill the height of its parent. */
  fullHeight?: boolean;

  /** Adds a subtle decorative highlight layer. */
  highlight?: boolean;

  /** Optional accessible label for the region. */
  ariaLabel?: string;

  /** Optional accessible labelledby id for the region. */
  ariaLabelledby?: string;
}

export type FeatureCardTone =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error';

export type FeatureCardVariant = 'glass' | 'surface' | 'outlined' | 'plain';

export type FeatureCardAlign = 'left' | 'center' | 'right';

export interface FeatureCardProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  media?: ReactNode;
  children?: ReactNode;

  href?: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  actionLabel?: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;

  tone?: FeatureCardTone;
  variant?: FeatureCardVariant;
  align?: FeatureCardAlign;

  disabled?: boolean;
  compact?: boolean;
  fullHeight?: boolean;
  hoverable?: boolean;
  showArrow?: boolean;

  sx?: SxProps<Theme>;
  rootSx?: SxProps<Theme>;
  actionAreaSx?: SxProps<Theme>;
  contentSx?: SxProps<Theme>;
  iconSx?: SxProps<Theme>;
  mediaSx?: SxProps<Theme>;
  actionSx?: SxProps<Theme>;
}

export type FeatureCardVariant = 'glass' | 'surface' | 'outlined' | 'plain';