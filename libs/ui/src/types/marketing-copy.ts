import type { ElementType, ReactNode } from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { StackProps } from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import type { TypographyProps } from '@mui/material/Typography';

export type MarketingCopyAlign = 'left' | 'center' | 'right';

export type MarketingCopyVariant =
  | 'default'
  | 'hero'
  | 'section'
  | 'compact'
  | 'callout';

export type MarketingCopyTone =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error';

export type MarketingCopySlotProps = {
  root?: Partial<BoxProps>;
  stack?: Partial<StackProps>;
  eyebrow?: Partial<TypographyProps>;
  title?: Partial<TypographyProps>;
  subtitle?: Partial<TypographyProps>;
  description?: Partial<TypographyProps>;
  body?: Partial<BoxProps>;
  actions?: Partial<BoxProps>;
  footnote?: Partial<TypographyProps>;
};

export interface MarketingCopyProps
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

  align?: MarketingCopyAlign;
  variant?: MarketingCopyVariant;
  tone?: MarketingCopyTone;

  maxWidth?: number | string;
  centered?: boolean;
  spacing?: StackProps['spacing'];

  titleId?: string;
  titleComponent?: TypographyProps['component'];
  titleVariant?: TypographyProps['variant'];
  subtitleVariant?: TypographyProps['variant'];
  descriptionVariant?: TypographyProps['variant'];

  eyebrowSx?: SxProps<Theme>;
  titleSx?: SxProps<Theme>;
  subtitleSx?: SxProps<Theme>;
  descriptionSx?: SxProps<Theme>;
  bodySx?: SxProps<Theme>;
  actionsSx?: SxProps<Theme>;
  footnoteSx?: SxProps<Theme>;

  slotProps?: MarketingCopySlotProps;
}
