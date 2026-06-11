import type { ElementType, ReactNode } from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { ContainerProps } from '@mui/material/Container';
import type { SxProps, Theme } from '@mui/material/styles';

import type { CarouselItem, MediaCarouselProps } from './carousel';
import type { FeatureGridItem, FeatureGridProps } from './feature-grid';
import type {
  MarketingCopyAlign,
  MarketingCopyProps,
  MarketingCopyTone,
  MarketingCopyVariant,
} from './marketing-copy';

export type MarketingSectionVariant =
  | 'default'
  | 'plain'
  | 'surface'
  | 'glass'
  | 'gradient'
  | 'dark';

export type MarketingSectionSpacing = 'none' | 'compact' | 'normal' | 'spacious';

export type MarketingSectionMediaPosition = 'left' | 'right' | 'top' | 'bottom';

export type MarketingSectionFeatureLayout = 'none' | 'grid' | 'carousel';

export type MarketingSectionSlotProps = {
  root?: Partial<BoxProps>;
  container?: Partial<ContainerProps>;
  inner?: Partial<BoxProps>;
  copy?: Partial<BoxProps>;
  media?: Partial<BoxProps>;
  features?: Partial<BoxProps>;
};

export interface MarketingSectionProps
  extends Omit<BoxProps, 'children' | 'component' | 'title'> {
  component?: ElementType;

  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;

  media?: ReactNode;
  mediaPosition?: MarketingSectionMediaPosition;
  mediaFirstOnMobile?: boolean;

  features?: readonly FeatureGridItem[];
  featureLayout?: MarketingSectionFeatureLayout;

  /**
   * Explicit carousel items for the shared media carousel.
   *
   * Supports image, video, PowerPoint, and custom carousel items.
   * If omitted and `featureLayout` is `carousel`, MarketingSection can
   * convert `features` into custom carousel slides.
   */
  carouselItems?: readonly CarouselItem[];

  featureGridProps?: Omit<
    FeatureGridProps,
    | 'items'
    | 'eyebrow'
    | 'title'
    | 'description'
    | 'actions'
    | 'emptyState'
  >;

  /**
   * Props passed to libs/ui/src/components/media/carousel.tsx.
   */
  carouselProps?: Omit<MediaCarouselProps, 'items' | 'children'>;

  variant?: MarketingSectionVariant;
  spacingY?: MarketingSectionSpacing;
  align?: MarketingCopyAlign;
  tone?: MarketingCopyTone;
  copyVariant?: MarketingCopyVariant;

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  mediaMaxWidth?: number | string;

  fullHeight?: boolean;
  centerContent?: boolean;

  gridColumns?: readonly [string, string];
  mediaBreakpoint?: 'sm' | 'md' | 'lg' | 'xl';

  copyProps?: Omit<
    MarketingCopyProps,
    | 'component'
    | 'eyebrow'
    | 'title'
    | 'subtitle'
    | 'description'
    | 'body'
    | 'children'
    | 'actions'
    | 'footnote'
    | 'align'
    | 'variant'
    | 'tone'
    | 'maxWidth'
  >;

  background?: ReactNode;

  containerSx?: SxProps<Theme>;
  innerSx?: SxProps<Theme>;
  copySx?: SxProps<Theme>;
  mediaSx?: SxProps<Theme>;
  featuresSx?: SxProps<Theme>;

  slotProps?: MarketingSectionSlotProps;
}
