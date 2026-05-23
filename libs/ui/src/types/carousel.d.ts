import type {
  CSSProperties,
  ReactNode,
  VideoHTMLAttributes,
} from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { CardProps as MuiCardProps } from '@mui/material/Card';
import type { StackProps } from '@mui/material/Stack';
import type { ImageProps as NextImageProps } from 'next/image';

export type CarouselBaseItem = {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  caption?: ReactNode;
  ariaLabel?: string;
};

export type CarouselImageItem = CarouselBaseItem & {
  type: 'image';
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

export type CarouselVideoSource = {
  src: string;
  type?: string;
};

export type CarouselVideoItem = CarouselBaseItem & {
  type: 'video';
  src?: string;
  sources?: readonly CarouselVideoSource[];
  poster?: string;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: VideoHTMLAttributes<HTMLVideoElement>['preload'];
  videoProps?: Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    | 'src'
    | 'poster'
    | 'controls'
    | 'muted'
    | 'loop'
    | 'autoPlay'
    | 'playsInline'
    | 'preload'
  >;
};

export type CarouselPowerPointItem = CarouselBaseItem & {
  type: 'powerpoint';

  /**
   * Public PPT/PPTX, PDF, Office embed URL, or iframe-compatible URL.
   */
  src?: PowerPointPlayerProps['src'];

  /**
   * Rendering mode for the PowerPoint player.
   */
  mode?: PowerPointPlayerMode;

  /**
   * Optional exported image slides.
   */
  slides?: readonly PowerPointSlide[];

  initialSlide?: number;
  iframeTitle?: string;
  height?: number | string;
  aspectRatio?: string | number;
  loading?: 'eager' | 'lazy';
  allowFullScreen?: boolean;

  downloadHref?: string;
  downloadLabel?: ReactNode;
  openInNewTabLabel?: ReactNode;

  powerPointProps?: Omit<
    PowerPointPlayerProps,
    | 'id'
    | 'src'
    | 'mode'
    | 'title'
    | 'description'
    | 'slides'
    | 'initialSlide'
    | 'iframeTitle'
    | 'height'
    | 'aspectRatio'
    | 'loading'
    | 'allowFullScreen'
    | 'downloadHref'
    | 'downloadLabel'
    | 'openInNewTabLabel'
    | 'card'
    | 'sx'
    | 'frameSx'
  >;
};

export type CarouselCustomItem = CarouselBaseItem & {
  type: 'custom';
  content: ReactNode;
};

export type CarouselItem =
  | CarouselImageItem
  | CarouselVideoItem
  | CarouselPowerPointItem
  | CarouselCustomItem;

export type CdnVideoInput = Omit<CarouselVideoItem, 'type'> & {
  /**
   * CDN URL for the video file.
   *
   * Example:
   * https://cdn.example.com/videos/helix-preview.mp4
   */
  src?: string;

  /**
   * Optional multiple CDN video sources.
   *
   * Useful when serving mp4/webm variants.
   */
  sources?: readonly CarouselVideoSource[];
};

export type PowerPointCarouselInput = Omit<CarouselPowerPointItem, 'type'>;

export type MediaCarouselSlotProps = {
  card?: Partial<MuiCardProps>;
  viewport?: Partial<BoxProps>;
  slide?: Partial<BoxProps>;
  media?: Partial<BoxProps>;
  caption?: Partial<BoxProps>;
  arrows?: Partial<BoxProps>;
  pagination?: Partial<StackProps>;
  paginationDot?: Partial<BoxProps>;
  progress?: Partial<BoxProps>;
  fullscreenButton?: Partial<BoxProps>;
};

export type MediaCarouselProps = Omit<BoxProps, 'children'> & {
  items?: readonly CarouselItem[];
  children?: ReactNode;

  initialIndex?: number;

  /**
   * Enables automatic slide movement.
   */
  autoScroll?: boolean;

  /**
   * Time between automatic slide changes.
   */
  autoScrollInterval?: number;

  /**
   * Stops auto scrolling while the user is hovering over the carousel.
   */
  pauseOnHover?: boolean;

  /**
   * Stops auto scrolling while the carousel has keyboard focus.
   */
  pauseOnFocus?: boolean;

  /**
   * Stops auto scrolling while a video is actively playing.
   */
  pauseOnVideoPlay?: boolean;

  /**
   * Allows next/previous to wrap around.
   */
  loop?: boolean;

  showArrows?: boolean;
  showPagination?: boolean;
  showProgress?: boolean;
  showCaptions?: boolean;
  showFullscreenButton?: boolean;

  /**
   * Browser fullscreen support.
   */
  fullscreen?: boolean;

  aspectRatio?: string | number;
  objectFit?: CSSProperties['objectFit'];
  objectPosition?: CSSProperties['objectPosition'];

  rounded?: boolean | number | string;
  bordered?: boolean;
  elevated?: boolean;

  imageSizes?: string;

  /**
   * CDN-hosted videos to append to the carousel.
   */
  cdnVideos?: readonly CdnVideoInput[];

  /**
   * PowerPoint/PDF/embed presentations to append to the carousel.
   */
  powerpoints?: readonly PowerPointCarouselInput[];

  /**
   * Enables client-side discovery of sequential public image files.
   */
  autoDiscoverImages?: boolean;

  imageBasePath?: string;
  imageFilePrefix?: string;
  imageExtension?: string;
  startIndex?: number;
  maxImages?: number;
  stopAfterMisses?: number;
  imageAltPrefix?: string;
  imageTitlePrefix?: string;
  videoTitlePrefix?: string;
  powerPointTitlePrefix?: string;

  onIndexChange?: (index: number, item: CarouselItem) => void;

  slotProps?: MediaCarouselSlotProps;
};