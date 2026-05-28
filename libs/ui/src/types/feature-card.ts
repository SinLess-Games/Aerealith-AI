import type {
  HTMLAttributeAnchorTarget,
  MouseEventHandler,
  ReactNode,
} from 'react';

import type { SxProps, Theme } from '@mui/material/styles';

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
