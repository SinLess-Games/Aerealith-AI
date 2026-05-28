export type ContentMediaType = 'image' | 'video';

export interface ContentVideoSource {
  src: string;
  type?: string;
}

export interface ContentImageItem {
  id?: string;
  type: 'image';
  src: string;
  alt: string;
  title?: string;
  description?: string;
  caption?: string;
  ariaLabel?: string;
  priority?: boolean;
}

export interface ContentVideoItem {
  id: string;
  type: 'video';
  title?: string;
  description?: string;
  caption?: string;
  ariaLabel?: string;
  src?: string;
  sources?: readonly ContentVideoSource[];
  poster?: string;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

export type ContentMediaItem = ContentImageItem | ContentVideoItem;

export interface SequentialImageDiscoveryConfig {
  imageBasePath: string;
  imageFilePrefix: string;
  imageExtension: string;
  startIndex: number;
  maxImages: number;
  stopAfterMisses: number;
  imageAltPrefix: string;
  imageTitlePrefix: string;
}

export interface ContentCarouselConfig {
  items?: readonly ContentMediaItem[];
  cdnVideos?: readonly ContentVideoItem[];
  autoDiscoverImages?: boolean;
  discovery?: SequentialImageDiscoveryConfig;

  autoScroll?: boolean;
  autoScrollInterval?: number;
  pauseOnHover?: boolean;
  pauseOnFocus?: boolean;
  pauseOnVideoPlay?: boolean;
  loop?: boolean;
  showArrows?: boolean;
  showPagination?: boolean;
  showProgress?: boolean;
  showCaptions?: boolean;
  showFullscreenButton?: boolean;
  fullscreen?: boolean;
  aspectRatio?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  rounded?: boolean;
  bordered?: boolean;
  elevated?: boolean;
  imageSizes?: string;
}
