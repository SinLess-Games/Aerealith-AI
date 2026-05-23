import type { ElementType, ReactNode } from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { StackProps } from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';

import type { FeatureCardProps } from './feature-card';

export type FeatureGridAlign = 'left' | 'center' | 'right';

export type FeatureGridColumns =
  | number
  | {
      xs?: number;
      sm?: number;
      md?: number;
      lg?: number;
      xl?: number;
    };

export type FeatureGridResponsiveValue<T> =
  | T
  | {
      xs?: T;
      sm?: T;
      md?: T;
      lg?: T;
      xl?: T;
    };

export interface FeatureGridItem extends FeatureCardProps {
  id?: string;

  /**
   * Allows one card to visually stand out in the grid.
   *
   * By default this spans 2 columns on md+ screens.
   */
  featured?: boolean;

  /**
   * Optional grid-column override for the item wrapper.
   *
   * Examples:
   * - 'span 2'
   * - { xs: 'span 1', md: 'span 2' }
   */
  gridColumn?: FeatureGridResponsiveValue<string | number>;

  /**
   * Optional grid-row override for the item wrapper.
   */
  gridRow?: FeatureGridResponsiveValue<string | number>;

  /**
   * Optional wrapper styling for the grid item.
   */
  itemSx?: SxProps<Theme>;
}

export type FeatureGridSlotProps = {
  root?: Partial<BoxProps>;
  header?: Partial<StackProps>;
  actions?: Partial<BoxProps>;
  grid?: Partial<BoxProps>;
  item?: Partial<BoxProps>;
  empty?: Partial<BoxProps>;
};

export interface FeatureGridProps
  extends Omit<BoxProps, 'children' | 'component' | 'title'> {
  component?: ElementType;

  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;

  items?: readonly FeatureGridItem[];

  columns?: FeatureGridColumns;
  gap?: FeatureGridResponsiveValue<number | string>;
  minCardWidth?: number | string;

  align?: FeatureGridAlign;
  maxWidth?: number | string;
  centered?: boolean;

  cardFullHeight?: boolean;
  compactCards?: boolean;

  emptyState?: ReactNode;

  slotProps?: FeatureGridSlotProps;
}