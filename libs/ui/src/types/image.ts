import type { CSSProperties } from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { ImageProps as NextImageProps } from 'next/image';

export type MediaImageProps = Omit<
  BoxProps,
  'children' | 'width' | 'height'
> & {
  src: NextImageProps['src'];
  alt: string;

  width?: NextImageProps['width'];
  height?: NextImageProps['height'];
  fill?: NextImageProps['fill'];
  sizes?: NextImageProps['sizes'];
  quality?: NextImageProps['quality'];
  priority?: NextImageProps['priority'];
  loading?: NextImageProps['loading'];
  placeholder?: NextImageProps['placeholder'];
  blurDataURL?: NextImageProps['blurDataURL'];
  unoptimized?: NextImageProps['unoptimized'];

  /**
   * Sets the image/container ratio.
   *
   * Examples:
   * - "16 / 9"
   * - "4 / 3"
   * - "1 / 1"
   */
  aspectRatio?: string | number;

  /**
   * Controls how the image fits inside the wrapper.
   */
  objectFit?: CSSProperties['objectFit'];

  /**
   * Controls image focal point.
   *
   * Examples:
   * - "center"
   * - "top"
   * - "50% 40%"
   */
  objectPosition?: CSSProperties['objectPosition'];

  /**
   * Applies rounded corners to the wrapper and image.
   */
  rounded?: boolean | number | string;

  /**
   * Adds a subtle border.
   */
  bordered?: boolean;

  /**
   * Adds a subtle shadow.
   */
  elevated?: boolean;

  /**
   * Allows clicking the image wrapper to open fullscreen.
   *
   * Defaults to true.
   */
  fullscreenOnClick?: boolean;

  /**
   * Shows the fullscreen close button.
   *
   * Defaults to true.
   */
  showFullscreenCloseButton?: boolean;

  /**
   * Accessible label for the fullscreen close button.
   */
  closeFullscreenLabel?: string;

  /**
   * Additional props passed directly to Next/Image.
   */
  imageProps?: Omit<
    NextImageProps,
    | 'src'
    | 'alt'
    | 'width'
    | 'height'
    | 'fill'
    | 'sizes'
    | 'quality'
    | 'priority'
    | 'loading'
    | 'placeholder'
    | 'blurDataURL'
    | 'unoptimized'
  >;
};
