import type { ReactNode } from 'react';

import type { CardProps } from '@mui/material/Card';
import type { SxProps, Theme } from '@mui/material/styles';

export type PowerPointPlayerMode = 'auto' | 'iframe' | 'office' | 'pdf' | 'slides';

export type PowerPointSlide = {
  id?: string;
  src: string;
  alt: string;
  title?: ReactNode;
  description?: ReactNode;
};

export interface PowerPointPlayerProps {
  id?: string;

  /**
   * Public PPT/PPTX, PDF, or already-embedded presentation URL.
   */
  src?: string;

  /**
   * Rendering mode:
   * - auto: slides when provided, Office viewer for public ppt/pptx URLs, iframe otherwise
   * - office: Microsoft Office online viewer for public PPT/PPTX URLs
   * - iframe: direct iframe embed
   * - pdf: direct iframe embed, intended for exported PDF decks
   * - slides: image-slide player
   */
  mode?: PowerPointPlayerMode;

  title?: ReactNode;
  description?: ReactNode;

  slides?: readonly PowerPointSlide[];
  initialSlide?: number;

  iframeTitle?: string;
  height?: number | string;
  aspectRatio?: string | number;
  loading?: 'eager' | 'lazy';
  allowFullScreen?: boolean;

  card?: boolean;
  cardProps?: Omit<CardProps, 'children'>;

  downloadHref?: string;
  downloadLabel?: ReactNode;
  openInNewTabLabel?: ReactNode;

  sx?: SxProps<Theme>;
  frameSx?: SxProps<Theme>;
  slideSx?: SxProps<Theme>;
  actionsSx?: SxProps<Theme>;

  onSlideChange?: (index: number, slide: PowerPointSlide) => void;
}