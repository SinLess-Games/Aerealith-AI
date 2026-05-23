import type { ElementType, ReactNode } from 'react';

import type {
  BoxProps,
  ContainerProps,
  StackProps,
  TypographyProps,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type SectionMediaPosition = 'left' | 'right' | 'top' | 'bottom';

export type SectionAlign = 'left' | 'center' | 'right';

export type SectionVariant =
  | 'plain'
  | 'default'
  | 'surface'
  | 'glass'
  | 'gradient';

export type SectionSpacing = 'none' | 'compact' | 'normal' | 'spacious';

export type SectionSlotProps = {
  container?: Omit<Partial<ContainerProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  inner?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  content?: Omit<Partial<StackProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  header?: Omit<Partial<StackProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  eyebrow?: Omit<Partial<TypographyProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  title?: Omit<Partial<TypographyProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  description?: Omit<Partial<TypographyProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  media?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  actions?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };

  body?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
};

export type SectionProps = Omit<BoxProps, 'children' | 'component' | 'title'> & {
  component?: ElementType;

  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;

  /**
   * Any visual/media component:
   * image, video, screenshot card, demo player, illustration, carousel, etc.
   */
  media?: ReactNode;

  /**
   * Controls where the media appears.
   */
  mediaPosition?: SectionMediaPosition;

  /**
   * Optional CTA/buttons/actions area.
   */
  actions?: ReactNode;

  /**
   * Max width for the section content.
   *
   * Defaults to 1900px.
   */
  maxContentWidth?: number | string;

  /**
   * Optional max width for the text/content column.
   */
  maxTextWidth?: number | string;

  /**
   * Optional max width when there is no media.
   */
  maxTextOnlyWidth?: number | string;

  /**
   * Controls the desktop grid layout when side media exists.
   */
  mediaGridColumns?: readonly [string, string];

  /**
   * Breakpoint where side-by-side layout activates.
   */
  mediaBreakpoint?: 'sm' | 'md' | 'lg' | 'xl';

  /**
   * Content alignment.
   */
  align?: SectionAlign;

  /**
   * Visual surface treatment.
   */
  variant?: SectionVariant;

  /**
   * Vertical section padding.
   */
  spacingY?: SectionSpacing;

  /**
   * Controls vertical spacing inside the content stack.
   */
  spacing?: StackProps['spacing'];

  /**
   * Whether the section should fill the viewport height.
   */
  fullHeight?: boolean;

  /**
   * Whether content should be vertically centered.
   */
  centerContent?: boolean;

  /**
   * Whether media should come before text on mobile.
   */
  mediaFirstOnMobile?: boolean;

  /**
   * Optional generated/explicit title id.
   */
  titleId?: string;

  /**
   * Override title typography element.
   */
  titleComponent?: TypographyProps['component'];

  /**
   * Override title typography variant.
   */
  titleVariant?: TypographyProps['variant'];

  /**
   * Optional props for internal slots.
   */
  slotProps?: SectionSlotProps;
};