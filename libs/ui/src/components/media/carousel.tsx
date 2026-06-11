// libs/ui/src/components/media/carousel.tsx

'use client';

import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactElement,
  ReactNode,
} from 'react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Box,
  Button,
  CardContent,
  Fade,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

import type {
  CarouselImageItem,
  CarouselItem,
  CarouselPowerPointItem,
  CarouselVideoItem,
  CdnVideoInput,
  MediaCarouselProps,
  MediaCarouselSlotProps,
  PowerPointCarouselInput,
} from '../../types';
import MediaImage from './image';
import PowerPointPlayer from './power-point-player';

export type {
  CarouselBaseItem,
  CarouselCustomItem,
  CarouselImageItem,
  CarouselItem,
  CarouselPowerPointItem,
  CarouselVideoItem,
  CarouselVideoSource,
  CdnVideoInput,
  MediaCarouselProps,
  MediaCarouselSlotProps,
  PowerPointCarouselInput
} from '../../types';

type SxArrayItem =
  | SystemStyleObject<Theme>
  | ((theme: Theme) => SystemStyleObject<Theme>);

type CarouselBorderRadius =
  | number
  | string
  | {
      xs?: number | string;
      sm?: number | string;
      md?: number | string;
      lg?: number | string;
      xl?: number | string;
    };

type PanPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  panStartX: number;
  panStartY: number;
  moved: boolean;
};

type ExtendedMediaCarouselProps = MediaCarouselProps & {
  aspectRatio?: string | number;
  objectFit?: CSSProperties['objectFit'];
  objectPosition?: CSSProperties['objectPosition'];
  rounded?: boolean | CarouselBorderRadius;
  bordered?: boolean;
  elevated?: boolean;
  imageSizes?: string;
  cdnVideos?: CdnVideoInput[];
  powerpoints?: PowerPointCarouselInput[];
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

const DEFAULT_MEDIA_MAX_SCAN_COUNT = 100;
const DEFAULT_MEDIA_START_INDEX = 1;
const DEFAULT_MEDIA_STOP_AFTER_MISSES = 1;

const MIN_FULLSCREEN_ZOOM = 1;
const MAX_FULLSCREEN_ZOOM = 2;
const FULLSCREEN_ZOOM_STEP = 0.25;
const PAN_START_THRESHOLD_PX = 4;

function toSxArray(sx?: SxProps<Theme>): SxArrayItem[] {
  if (!sx) {
    return [];
  }

  const sxArray = Array.isArray(sx) ? sx : [sx];

  return sxArray.filter(Boolean) as SxArrayItem[];
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), count - 1);
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_FULLSCREEN_ZOOM, Math.max(MIN_FULLSCREEN_ZOOM, zoom));
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

function getItemKey(item: CarouselItem, index: number): string {
  return item.id ?? `${item.type}-${index}`;
}

function mergeClassNames(
  ...classNames: Array<string | false | null | undefined>
): string | undefined {
  const className = classNames.filter(Boolean).join(' ').trim();

  return className.length > 0 ? className : undefined;
}

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        'a',
        'button',
        'input',
        'select',
        'textarea',
        'summary',
        'video[controls]',
        'iframe',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[contenteditable="true"]',
        '.MuiButtonBase-root',
      ].join(','),
    ),
  );
}

function normalizeChildren(children: ReactNode): CarouselItem[] {
  return Children.toArray(children).map((child, index) => {
    if (isValidElement(child)) {
      return {
        id: child.key ? String(child.key) : `custom-${index}`,
        type: 'custom',
        content: child,
      };
    }

    return {
      id: `custom-${index}`,
      type: 'custom',
      content: child,
    };
  });
}

function isZoomableCarouselItem(item: CarouselItem | undefined): boolean {
  return Boolean(item && item.type !== 'powerpoint');
}

export function createSequentialCarouselImageUrl({
  imageBasePath,
  imageFilePrefix,
  imageExtension,
  index,
}: {
  imageBasePath: string;
  imageFilePrefix: string;
  imageExtension: string;
  index: number;
}): string {
  const normalizedBasePath = imageBasePath.replace(/\/$/, '');
  const normalizedExtension = imageExtension.replace(/^\./, '');

  return `${normalizedBasePath}/${imageFilePrefix}${index}.${normalizedExtension}`;
}

export function createSequentialCarouselImageItem({
  imageBasePath,
  imageFilePrefix,
  imageExtension,
  index,
  startIndex = DEFAULT_MEDIA_START_INDEX,
  imageAltPrefix,
  imageTitlePrefix,
}: {
  imageBasePath: string;
  imageFilePrefix: string;
  imageExtension: string;
  index: number;
  startIndex?: number;
  imageAltPrefix: string;
  imageTitlePrefix: string;
}): CarouselImageItem {
  return {
    id: `${imageFilePrefix.replace(/_$/, '')}-${index}`,
    type: 'image',
    src: createSequentialCarouselImageUrl({
      imageBasePath,
      imageFilePrefix,
      imageExtension,
      index,
    }),
    alt: `${imageAltPrefix} ${index}`,
    title: `${imageTitlePrefix} ${index}`,
    priority: index === startIndex,
  };
}

export function createCarouselVideoItem(
  video: CdnVideoInput,
  index = 0,
  videoTitlePrefix = 'Aerealith AI video',
): CarouselVideoItem {
  return {
    id: video.id ?? `cdn-video-${index + 1}`,
    type: 'video',
    title: video.title ?? `${videoTitlePrefix} ${index + 1}`,
    description: video.description,
    caption: video.caption,
    ariaLabel: video.ariaLabel ?? `${videoTitlePrefix} ${index + 1}`,
    src: video.src,
    sources: video.sources,
    poster: video.poster,
    controls: video.controls ?? true,
    muted: video.muted ?? false,
    loop: video.loop ?? false,
    autoPlay: video.autoPlay ?? false,
    playsInline: video.playsInline ?? true,
    preload: video.preload ?? 'metadata',
    videoProps: video.videoProps,
  };
}

export function createCarouselPowerPointItem(
  powerPoint: PowerPointCarouselInput,
  index = 0,
  powerPointTitlePrefix = 'Aerealith AI presentation',
): CarouselPowerPointItem {
  return {
    id: powerPoint.id ?? `powerpoint-${index + 1}`,
    type: 'powerpoint',
    title: powerPoint.title ?? `${powerPointTitlePrefix} ${index + 1}`,
    description: powerPoint.description,
    caption: powerPoint.caption,
    ariaLabel:
      powerPoint.ariaLabel ?? `${powerPointTitlePrefix} ${index + 1}`,
    src: powerPoint.src,
    mode: powerPoint.mode,
    slides: powerPoint.slides,
    initialSlide: powerPoint.initialSlide,
    iframeTitle: powerPoint.iframeTitle,
    height: powerPoint.height,
    aspectRatio: powerPoint.aspectRatio,
    loading: powerPoint.loading,
    allowFullScreen: powerPoint.allowFullScreen,
    downloadHref: powerPoint.downloadHref,
    downloadLabel: powerPoint.downloadLabel,
    openInNewTabLabel: powerPoint.openInNewTabLabel,
    powerPointProps: powerPoint.powerPointProps,
  };
}

export function cdnVideoItem(
  video: CdnVideoInput,
  index = 0,
  videoTitlePrefix = 'Aerealith AI video',
): CarouselVideoItem {
  return createCarouselVideoItem(video, index, videoTitlePrefix);
}

export function powerPointItem(
  powerPoint: PowerPointCarouselInput,
  index = 0,
  powerPointTitlePrefix = 'Aerealith AI presentation',
): CarouselPowerPointItem {
  return createCarouselPowerPointItem(
    powerPoint,
    index,
    powerPointTitlePrefix,
  );
}

export function carouselImageItem(
  image: Omit<CarouselImageItem, 'type'>,
): CarouselImageItem {
  return {
    ...image,
    type: 'image',
  };
}

function hasVideoSource(video: CdnVideoInput): boolean {
  return Boolean(video.src || video.sources?.length);
}

function hasPowerPointSource(powerPoint: PowerPointCarouselInput): boolean {
  return Boolean(powerPoint.src || powerPoint.slides?.length);
}

function imageExists(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    const image = new window.Image();

    image.onload = () => {
      resolve(true);
    };

    image.onerror = () => {
      resolve(false);
    };

    image.src = src;
  });
}

export function MediaCarousel({
  items,
  children,
  initialIndex = 0,
  autoScroll = false,
  autoScrollInterval = 6000,
  pauseOnHover = true,
  pauseOnFocus = true,
  pauseOnVideoPlay = true,
  loop = true,
  showArrows = true,
  showPagination = true,
  showProgress = true,
  showCaptions = true,
  showFullscreenButton = true,
  fullscreen = true,
  aspectRatio = '16 / 9',
  objectFit = 'cover',
  objectPosition = 'center',
  rounded = true,
  bordered = false,
  elevated = false,
  imageSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px',

  cdnVideos = [],
  powerpoints = [],
  autoDiscoverImages = false,
  imageBasePath = '/images/Branding/infographics',
  imageFilePrefix = 'info_',
  imageExtension = 'png',
  startIndex = DEFAULT_MEDIA_START_INDEX,
  maxImages = DEFAULT_MEDIA_MAX_SCAN_COUNT,
  stopAfterMisses = DEFAULT_MEDIA_STOP_AFTER_MISSES,
  imageAltPrefix = 'Aerealith AI media image',
  imageTitlePrefix = 'Media Image',
  videoTitlePrefix = 'Aerealith AI video',
  powerPointTitlePrefix = 'Aerealith AI presentation',

  onIndexChange,
  slotProps,
  sx,
  className,
  style,
  title,
  onClick,
  onContextMenu,
  onKeyDown,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...boxProps
}: ExtendedMediaCarouselProps): ReactElement | null {
  const carouselId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressNextClickRef = useRef(false);

  const explicitItems = useMemo<CarouselItem[]>(
    () => (items?.length ? [...items] : []),
    [items],
  );

  const childItems = useMemo<CarouselItem[]>(
    () => normalizeChildren(children),
    [children],
  );

  const videoItems = useMemo<CarouselVideoItem[]>(
    () =>
      cdnVideos
        .filter(hasVideoSource)
        .map((video: CdnVideoInput, index: number) =>
          createCarouselVideoItem(video, index, videoTitlePrefix),
        ),
    [cdnVideos, videoTitlePrefix],
  );

  const powerPointItems = useMemo<CarouselPowerPointItem[]>(
    () =>
      powerpoints
        .filter(hasPowerPointSource)
        .map((powerPoint: PowerPointCarouselInput, index: number) =>
          createCarouselPowerPointItem(
            powerPoint,
            index,
            powerPointTitlePrefix,
          ),
        ),
    [powerPointTitlePrefix, powerpoints],
  );

  const [discoveredImageItems, setDiscoveredImageItems] = useState<
    CarouselImageItem[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function discoverImages(): Promise<void> {
      if (!autoDiscoverImages) {
        return;
      }

      const foundItems: CarouselImageItem[] = [];
      let missedImages = 0;

      const safeStartIndex = Math.max(1, Math.floor(startIndex));
      const safeMaxImages = Math.max(1, Math.floor(maxImages));
      const safeStopAfterMisses = Math.max(1, Math.floor(stopAfterMisses));
      const endIndex = safeStartIndex + safeMaxImages - 1;

      for (let index = safeStartIndex; index <= endIndex; index += 1) {
        const src = createSequentialCarouselImageUrl({
          imageBasePath,
          imageFilePrefix,
          imageExtension,
          index,
        });

        const exists = await imageExists(src);

        if (cancelled) {
          return;
        }

        if (!exists) {
          missedImages += 1;

          if (missedImages >= safeStopAfterMisses) {
            break;
          }

          continue;
        }

        missedImages = 0;

        foundItems.push(
          createSequentialCarouselImageItem({
            imageBasePath,
            imageFilePrefix,
            imageExtension,
            index,
            startIndex: safeStartIndex,
            imageAltPrefix,
            imageTitlePrefix,
          }),
        );
      }

      if (!cancelled) {
        setDiscoveredImageItems(foundItems);
      }
    }

    void discoverImages();

    return () => {
      cancelled = true;
    };
  }, [
    autoDiscoverImages,
    imageAltPrefix,
    imageBasePath,
    imageExtension,
    imageFilePrefix,
    imageTitlePrefix,
    maxImages,
    startIndex,
    stopAfterMisses,
  ]);

  const slides = useMemo<CarouselItem[]>(() => {
    const configuredItems = [
      ...(autoDiscoverImages ? discoveredImageItems : []),
      ...explicitItems,
      ...videoItems,
      ...powerPointItems,
    ];

    if (configuredItems.length) {
      return configuredItems;
    }

    return childItems;
  }, [
    autoDiscoverImages,
    childItems,
    discoveredImageItems,
    explicitItems,
    powerPointItems,
    videoItems,
  ]);

  const count = slides.length;

  const [requestedActiveIndex, setActiveIndex] = useState(() =>
    clampIndex(initialIndex, count),
  );
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenZoom, setFullscreenZoom] = useState(MIN_FULLSCREEN_ZOOM);
  const [fullscreenPan, setFullscreenPan] = useState<PanPosition>({
    x: 0,
    y: 0,
  });
  const [isPanning, setIsPanning] = useState(false);

  const activeIndex = clampIndex(requestedActiveIndex, count);

  const borderRadius: CarouselBorderRadius =
    rounded === true ? { xs: 3, md: 4 } : rounded === false ? 0 : rounded;

  const activeItem = slides[activeIndex];
  const activeItemIsZoomable = isZoomableCarouselItem(activeItem);

  const canGoPrevious = loop || activeIndex > 0;
  const canGoNext = loop || activeIndex < count - 1;
  const canPanFullscreenMedia =
    isFullscreen && activeItemIsZoomable && fullscreenZoom > 1;
  const canZoomFullscreenMedia = isFullscreen && activeItemIsZoomable;

  const canAutoScroll =
    autoScroll &&
    count > 1 &&
    !isFullscreen &&
    (!pauseOnHover || !isHovered) &&
    (!pauseOnFocus || !hasFocus) &&
    (!pauseOnVideoPlay || !isVideoPlaying);

  const resetPan = useCallback(() => {
    setFullscreenPan({ x: 0, y: 0 });
    setIsPanning(false);
    dragStateRef.current = null;
    suppressNextClickRef.current = false;
  }, []);

  const resetZoom = useCallback(() => {
    setFullscreenZoom(MIN_FULLSCREEN_ZOOM);
    resetPan();
  }, [resetPan]);

  const zoomIn = useCallback(() => {
    if (!activeItemIsZoomable) {
      return;
    }

    setFullscreenZoom(
      roundZoom(clampZoom(fullscreenZoom + FULLSCREEN_ZOOM_STEP)),
    );
  }, [activeItemIsZoomable, fullscreenZoom]);

  const zoomOut = useCallback(() => {
    if (!activeItemIsZoomable) {
      return;
    }

    const nextZoom = roundZoom(
      clampZoom(fullscreenZoom - FULLSCREEN_ZOOM_STEP),
    );

    setFullscreenZoom(nextZoom);

    if (nextZoom <= MIN_FULLSCREEN_ZOOM) {
      resetPan();
    }
  }, [activeItemIsZoomable, fullscreenZoom, resetPan]);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (count <= 0) {
        return;
      }

      let resolvedIndex = nextIndex;

      if (loop) {
        resolvedIndex = (nextIndex + count) % count;
      } else {
        resolvedIndex = clampIndex(nextIndex, count);
      }

      setActiveIndex(resolvedIndex);
      setIsVideoPlaying(false);
      resetZoom();

      const nextItem = slides[resolvedIndex];

      if (nextItem) {
        onIndexChange?.(resolvedIndex, nextItem);
      }
    },
    [count, loop, onIndexChange, resetZoom, slides],
  );

  const goPrevious = useCallback(() => {
    if (!canGoPrevious) {
      return;
    }

    goTo(activeIndex - 1);
  }, [activeIndex, canGoPrevious, goTo]);

  const goNext = useCallback(() => {
    if (!canGoNext) {
      return;
    }

    goTo(activeIndex + 1);
  }, [activeIndex, canGoNext, goTo]);

  const enterFullscreen = useCallback(async () => {
    if (!fullscreen || !rootRef.current || !rootRef.current.requestFullscreen) {
      return;
    }

    await rootRef.current.requestFullscreen();
  }, [fullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement || !document.exitFullscreen) {
      return;
    }

    await document.exitFullscreen();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await exitFullscreen();
      return;
    }

    await enterFullscreen();
  }, [enterFullscreen, exitFullscreen]);

  const handleRootClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onClick?.(event);

      if (
        event.defaultPrevented ||
        !canZoomFullscreenMedia ||
        event.button !== 0 ||
        isInteractiveElement(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      zoomIn();
    },
    [canZoomFullscreenMedia, onClick, zoomIn],
  );

  const handleRootContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onContextMenu?.(event);

      if (
        event.defaultPrevented ||
        !canZoomFullscreenMedia ||
        isInteractiveElement(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      zoomOut();
    },
    [canZoomFullscreenMedia, onContextMenu, zoomOut],
  );

  const handleRootPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event);

      if (
        event.defaultPrevented ||
        !canPanFullscreenMedia ||
        event.button !== 0 ||
        isInteractiveElement(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panStartX: fullscreenPan.x,
        panStartY: fullscreenPan.y,
        moved: false,
      };

      setIsPanning(true);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore browsers that reject pointer capture for this event.
      }
    },
    [canPanFullscreenMedia, fullscreenPan.x, fullscreenPan.y, onPointerDown],
  );

  const handleRootPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event);

      const dragState = dragStateRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (
        Math.abs(deltaX) > PAN_START_THRESHOLD_PX ||
        Math.abs(deltaY) > PAN_START_THRESHOLD_PX
      ) {
        dragState.moved = true;
        suppressNextClickRef.current = true;
      }

      setFullscreenPan({
        x: dragState.panStartX + deltaX,
        y: dragState.panStartY + deltaY,
      });
    },
    [onPointerMove],
  );

  const endPointerPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.moved) {
      suppressNextClickRef.current = true;
    }

    dragStateRef.current = null;
    setIsPanning(false);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that already released pointer capture.
    }
  }, []);

  const handleRootPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerUp?.(event);
      endPointerPan(event);
    },
    [endPointerPan, onPointerUp],
  );

  const handleRootPointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerCancel?.(event);
      endPointerPan(event);
    },
    [endPointerPan, onPointerCancel],
  );

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (canPanFullscreenMedia) {
        const panStep = event.shiftKey ? 80 : 32;

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setFullscreenPan((currentPan) => ({
            ...currentPan,
            x: currentPan.x - panStep,
          }));
          return;
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          setFullscreenPan((currentPan) => ({
            ...currentPan,
            x: currentPan.x + panStep,
          }));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setFullscreenPan((currentPan) => ({
            ...currentPan,
            y: currentPan.y - panStep,
          }));
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setFullscreenPan((currentPan) => ({
            ...currentPan,
            y: currentPan.y + panStep,
          }));
          return;
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }

      if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        goTo(count - 1);
      }

      if (canZoomFullscreenMedia && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        zoomIn();
      }

      if (canZoomFullscreenMedia && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        zoomOut();
      }

      if (canZoomFullscreenMedia && event.key === '0') {
        event.preventDefault();
        resetZoom();
      }

      if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault();
        await exitFullscreen();
      }
    },
    [
      canPanFullscreenMedia,
      canZoomFullscreenMedia,
      count,
      exitFullscreen,
      goNext,
      goPrevious,
      goTo,
      onKeyDown,
      resetZoom,
      zoomIn,
      zoomOut,
    ],
  );

  useEffect(() => {
    if (!canAutoScroll) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      goNext();
    }, autoScrollInterval);

    return () => window.clearInterval(timer);
  }, [autoScrollInterval, canAutoScroll, goNext]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const fullscreenElement = document.fullscreenElement;
      const rootElement = rootRef.current;

      const rootIsFullscreen = Boolean(
        rootElement &&
          fullscreenElement &&
          (fullscreenElement === rootElement ||
            fullscreenElement.contains(rootElement) ||
            rootElement.contains(fullscreenElement)),
      );

      setIsFullscreen(rootIsFullscreen);

      if (!rootIsFullscreen) {
        resetZoom();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [resetZoom]);

  if (!count) {
    return null;
  }

  const progressSx: SxProps<Theme> = canAutoScroll
    ? {
        '@keyframes media-carousel-progress': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        animation: `media-carousel-progress ${autoScrollInterval}ms linear forwards`,
      }
    : {};

  const rootStyle = {
    ...style,
    '--helix-media-carousel-zoom': fullscreenZoom,
    '--helix-media-carousel-pan-x': `${fullscreenPan.x}px`,
    '--helix-media-carousel-pan-y': `${fullscreenPan.y}px`,
  } as CSSProperties;

  return (
    <Box
      {...boxProps}
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={boxProps['aria-label'] ?? 'Media carousel'}
      tabIndex={boxProps.tabIndex ?? 0}
      className={mergeClassNames('helix-media-carousel', className)}
      title={
        isFullscreen && canZoomFullscreenMedia
          ? `Zoom: ${Math.round(
              fullscreenZoom * 100,
            )}%. Left click to zoom in. Right click to zoom out. Drag to move while zoomed. Press 0 to reset.`
          : title
      }
      style={rootStyle}
      onClick={handleRootClick}
      onContextMenu={handleRootContextMenu}
      onKeyDown={handleKeyDown}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handleRootPointerMove}
      onPointerUp={handleRootPointerUp}
      onPointerCancel={handleRootPointerCancel}
      onFocus={(event) => {
        onFocus?.(event);
        setHasFocus(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        setHasFocus(false);
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        setIsHovered(true);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        setIsHovered(false);
      }}
      sx={[
        {
          width: '100%',
          outline: 'none',
          bgcolor: 'transparent',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          touchAction: canPanFullscreenMedia ? 'none' : undefined,
          cursor: isFullscreen
            ? canPanFullscreenMedia
              ? isPanning
                ? 'grabbing'
                : 'grab'
              : canZoomFullscreenMedia
                ? fullscreenZoom >= MAX_FULLSCREEN_ZOOM
                  ? 'zoom-out'
                  : 'zoom-in'
                : undefined
            : undefined,

          '&:focus-visible': {
            boxShadow: '0 0 0 3px rgba(246, 6, 111, 0.35)',
            borderRadius,
          },

          '&:fullscreen': {
            width: '100vw !important',
            maxWidth: '100vw !important',
            height: '100dvh !important',
            maxHeight: '100dvh !important',
            display: 'grid !important',
            placeItems: 'center !important',
            p: { xs: 1, md: 2 },
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            overflow: 'hidden !important',
            userSelect: 'none',
          },

          '&:fullscreen .helix-media-carousel-card': {
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100% !important',
            maxHeight: '100% !important',
            display: 'flex !important',
            flexDirection: 'column !important',
            borderRadius: '0 !important',
            borderColor: 'transparent !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            boxShadow: 'none !important',
            overflow: 'hidden !important',
          },

          '&:fullscreen .helix-media-carousel-viewport': {
            flex: '1 1 auto !important',
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100% !important',
            maxHeight: '100% !important',
            minHeight: '0 !important',
            aspectRatio: 'auto !important',
            display: 'grid !important',
            placeItems: 'center !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            overflow: 'hidden !important',
          },

          '&:fullscreen .helix-media-carousel-slide': {
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100% !important',
            maxHeight: '100% !important',
            display: 'grid !important',
            placeItems: 'center !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            overflow: 'hidden !important',
          },

          '&:fullscreen .helix-media-carousel-media': {
            position: 'relative !important',
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100% !important',
            maxHeight: '100% !important',
            display: 'grid !important',
            placeItems: 'center !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            overflow: 'hidden !important',
          },

          '&:fullscreen .helix-media-carousel-media > .MuiBox-root': {
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100% !important',
            maxHeight: '100% !important',
            display: 'grid !important',
            placeItems: 'center !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
            overflow: 'hidden !important',
          },

          '&:fullscreen .helix-media-carousel-caption, &:fullscreen .helix-media-carousel-pagination, &:fullscreen .helix-media-carousel-progress':
            {
              display: 'none !important',
            },

          '&:fullscreen iframe': {
            width: '100% !important',
            height: '100% !important',
            maxWidth: '100% !important',
            maxHeight: '100% !important',
            border: '0 !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            backgroundImage: 'none !important',
          },

          '&:fullscreen img, &:fullscreen video, &:fullscreen canvas, &:fullscreen svg':
            {
              width: 'auto !important',
              height: 'auto !important',
              maxWidth: '100% !important',
              maxHeight: '100% !important',
              objectFit: 'contain !important',
              objectPosition: 'center center !important',
              transform:
                'translate3d(var(--helix-media-carousel-pan-x, 0px), var(--helix-media-carousel-pan-y, 0px), 0) scale(var(--helix-media-carousel-zoom, 1)) !important',
              transformOrigin: 'center center !important',
              transition: isPanning
                ? 'none !important'
                : 'transform 160ms ease !important',
              willChange: 'transform',
              userSelect: 'none',
            },

          '&:fullscreen img[data-nimg="fill"], &:fullscreen img[style*="position: absolute"]':
            {
              position: 'absolute !important',
              inset: '0 !important',
              width: '100% !important',
              height: '100% !important',
              maxWidth: '100% !important',
              maxHeight: '100% !important',
              objectFit: 'contain !important',
              objectPosition: 'center center !important',
              transform:
                'translate3d(var(--helix-media-carousel-pan-x, 0px), var(--helix-media-carousel-pan-y, 0px), 0) scale(var(--helix-media-carousel-zoom, 1)) !important',
              transformOrigin: 'center center !important',
              transition: isPanning
                ? 'none !important'
                : 'transform 160ms ease !important',
              willChange: 'transform',
              userSelect: 'none',
            },
        },
        ...toSxArray(sx),
      ]}
    >
      <Box
        {...slotProps?.card}
        className={mergeClassNames(
          'helix-media-carousel-card',
          slotProps?.card?.className,
        )}
        sx={[
          {
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            borderRadius,
            border: bordered ? 1 : 0,
            borderColor: bordered
              ? 'rgba(255, 255, 255, 0.12)'
              : 'transparent',
            bgcolor: 'transparent',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            boxShadow: elevated
              ? '0 24px 76px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
              : 'none',
          },
          ...toSxArray(slotProps?.card?.sx),
        ]}
      >
        <Box
          {...slotProps?.viewport}
          className={mergeClassNames(
            'helix-media-carousel-viewport',
            slotProps?.viewport?.className,
          )}
          sx={[
            {
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              aspectRatio,
              bgcolor: 'transparent',
              backgroundColor: 'transparent',
              backgroundImage: 'none',
            },
            ...toSxArray(slotProps?.viewport?.sx),
          ]}
        >
          {slides.map((item, index) => {
            const isActive = index === activeIndex;
            const slideId = `${carouselId}-slide-${index}`;

            return (
              <Fade key={getItemKey(item, index)} in={isActive} timeout={360}>
                <Box
                  id={slideId}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={
                    item.ariaLabel ?? `Slide ${index + 1} of ${count}`
                  }
                  hidden={!isActive}
                  {...slotProps?.slide}
                  className={mergeClassNames(
                    'helix-media-carousel-slide',
                    slotProps?.slide?.className,
                  )}
                  sx={[
                    {
                      position: 'absolute',
                      inset: 0,
                      display: isActive ? 'block' : 'none',
                      width: '100%',
                      height: '100%',
                      bgcolor: 'transparent',
                      backgroundColor: 'transparent',
                      backgroundImage: 'none',
                    },
                    ...toSxArray(slotProps?.slide?.sx),
                  ]}
                >
                  {item.type === 'image' ? (
                    <Box
                      {...slotProps?.media}
                      className={mergeClassNames(
                        'helix-media-carousel-media',
                        slotProps?.media?.className,
                      )}
                      sx={[
                        {
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        },
                        ...toSxArray(slotProps?.media?.sx),
                      ]}
                    >
                      <MediaImage
                        src={item.src}
                        alt={item.alt}
                        width={item.width}
                        height={item.height}
                        fill={item.fill ?? (!item.width || !item.height)}
                        sizes={item.sizes ?? imageSizes}
                        quality={item.quality}
                        priority={item.priority}
                        loading={item.loading}
                        placeholder={item.placeholder}
                        blurDataURL={item.blurDataURL}
                        unoptimized={item.unoptimized}
                        aspectRatio={aspectRatio}
                        objectFit={isFullscreen ? 'contain' : objectFit}
                        objectPosition={objectPosition}
                        rounded={false}
                        bordered={false}
                        elevated={false}
                        fullscreenOnClick={false}
                        imageProps={item.imageProps}
                        sx={{
                          width: '100%',
                          height: '100%',
                          aspectRatio: undefined,
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        }}
                      />
                    </Box>
                  ) : null}

                  {item.type === 'video' ? (
                    <Box
                      {...slotProps?.media}
                      className={mergeClassNames(
                        'helix-media-carousel-media',
                        slotProps?.media?.className,
                      )}
                      sx={[
                        {
                          width: '100%',
                          height: '100%',
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        },
                        ...toSxArray(slotProps?.media?.sx),
                      ]}
                    >
                      <Box
                        component="video"
                        src={item.src}
                        poster={item.poster}
                        controls={item.controls ?? true}
                        muted={item.muted ?? true}
                        loop={item.loop}
                        autoPlay={item.autoPlay}
                        playsInline={item.playsInline ?? true}
                        preload={item.preload ?? 'metadata'}
                        {...item.videoProps}
                        onPlay={(event) => {
                          setIsVideoPlaying(true);
                          item.videoProps?.onPlay?.(event);
                        }}
                        onPause={(event) => {
                          setIsVideoPlaying(false);
                          item.videoProps?.onPause?.(event);
                        }}
                        onEnded={(event) => {
                          setIsVideoPlaying(false);
                          item.videoProps?.onEnded?.(event);
                        }}
                        sx={{
                          display: 'block',
                          width: '100%',
                          height: '100%',
                          objectFit: isFullscreen ? 'contain' : objectFit,
                          objectPosition,
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        }}
                      >
                        {item.sources?.map((source) => (
                          <source
                            key={`${source.src}-${source.type ?? 'video'}`}
                            src={source.src}
                            type={source.type}
                          />
                        ))}
                      </Box>
                    </Box>
                  ) : null}

                  {item.type === 'powerpoint' ? (
                    <Box
                      {...slotProps?.media}
                      className={mergeClassNames(
                        'helix-media-carousel-media',
                        slotProps?.media?.className,
                      )}
                      sx={[
                        {
                          width: '100%',
                          height: '100%',
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        },
                        ...toSxArray(slotProps?.media?.sx),
                      ]}
                    >
                      <PowerPointPlayer
                        {...item.powerPointProps}
                        id={`${slideId}-powerpoint`}
                        src={item.src}
                        mode={item.mode}
                        slides={item.slides}
                        initialSlide={item.initialSlide}
                        iframeTitle={item.iframeTitle}
                        height={item.height ?? '100%'}
                        aspectRatio={item.aspectRatio ?? aspectRatio}
                        loading={item.loading}
                        allowFullScreen={item.allowFullScreen}
                        downloadHref={item.downloadHref}
                        downloadLabel={item.downloadLabel}
                        openInNewTabLabel={item.openInNewTabLabel}
                        card={false}
                        sx={{
                          width: '100%',
                          height: '100%',
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        }}
                        frameSx={{
                          width: '100%',
                          height: '100%',
                          minHeight: 0,
                          border: 0,
                          borderRadius: 0,
                        }}
                      />
                    </Box>
                  ) : null}

                  {item.type === 'custom' ? (
                    <Box
                      {...slotProps?.media}
                      className={mergeClassNames(
                        'helix-media-carousel-media',
                        slotProps?.media?.className,
                      )}
                      sx={[
                        {
                          width: '100%',
                          height: '100%',
                          bgcolor: 'transparent',
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        },
                        ...toSxArray(slotProps?.media?.sx),
                      ]}
                    >
                      {item.content}
                    </Box>
                  ) : null}
                </Box>
              </Fade>
            );
          })}

          {showArrows && count > 1 ? (
            <Box
              {...slotProps?.arrows}
              className={mergeClassNames(
                'helix-media-carousel-arrows',
                slotProps?.arrows?.className,
              )}
              sx={[
                {
                  position: 'absolute',
                  insetInline: { xs: 10, md: 18 },
                  top: '50%',
                  zIndex: 3,
                  display: 'flex',
                  justifyContent: 'space-between',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                },
                ...toSxArray(slotProps?.arrows?.sx),
              ]}
            >
              <IconButton
                type="button"
                aria-label="Previous slide"
                aria-controls={`${carouselId}-slide-${activeIndex}`}
                onClick={goPrevious}
                disabled={!canGoPrevious}
                sx={{
                  width: { xs: 42, md: 48 },
                  height: { xs: 42, md: 48 },
                  color: 'common.white',
                  bgcolor: 'rgba(0, 0, 0, 0.42)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  backdropFilter: 'blur(12px)',
                  pointerEvents: 'auto',
                  '&:hover': {
                    bgcolor: 'rgba(246, 6, 111, 0.72)',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255, 255, 255, 0.28)',
                    bgcolor: 'rgba(0, 0, 0, 0.22)',
                  },
                }}
              >
                ‹
              </IconButton>

              <IconButton
                type="button"
                aria-label="Next slide"
                aria-controls={`${carouselId}-slide-${activeIndex}`}
                onClick={goNext}
                disabled={!canGoNext}
                sx={{
                  width: { xs: 42, md: 48 },
                  height: { xs: 42, md: 48 },
                  color: 'common.white',
                  bgcolor: 'rgba(0, 0, 0, 0.42)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  backdropFilter: 'blur(12px)',
                  pointerEvents: 'auto',
                  '&:hover': {
                    bgcolor: 'rgba(246, 6, 111, 0.72)',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255, 255, 255, 0.28)',
                    bgcolor: 'rgba(0, 0, 0, 0.22)',
                  },
                }}
              >
                ›
              </IconButton>
            </Box>
          ) : null}

          {fullscreen && showFullscreenButton ? (
            <Box
              {...slotProps?.fullscreenButton}
              className={mergeClassNames(
                'helix-media-carousel-fullscreen-button',
                slotProps?.fullscreenButton?.className,
              )}
              sx={[
                {
                  position: 'absolute',
                  top: { xs: 10, md: 16 },
                  right: { xs: 10, md: 16 },
                  zIndex: 4,
                },
                ...toSxArray(slotProps?.fullscreenButton?.sx),
              ]}
            >
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={toggleFullscreen}
                sx={{
                  minWidth: 0,
                  color: 'common.white',
                  borderColor: 'rgba(255, 255, 255, 0.24)',
                  bgcolor: 'rgba(0, 0, 0, 0.42)',
                  borderRadius: 999,
                  px: 1.5,
                  backdropFilter: 'blur(12px)',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: 'rgba(246, 6, 111, 0.7)',
                    bgcolor: 'rgba(246, 6, 111, 0.34)',
                  },
                }}
              >
                {isFullscreen ? 'Exit' : 'Fullscreen'}
              </Button>
            </Box>
          ) : null}

          {showProgress && count > 1 ? (
            <Box
              {...slotProps?.progress}
              className={mergeClassNames(
                'helix-media-carousel-progress',
                slotProps?.progress?.className,
              )}
              sx={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 5,
                  height: 3,
                  bgcolor: 'transparent',
                  backgroundColor: 'transparent',
                  backgroundImage: 'none',
                  overflow: 'hidden',
                },
                ...toSxArray(slotProps?.progress?.sx),
              ]}
            >
              <Box
                key={`${activeIndex}-${canAutoScroll}`}
                sx={{
                  width: '100%',
                  height: '100%',
                  transformOrigin: 'left center',
                  transform: canAutoScroll ? 'scaleX(0)' : 'scaleX(1)',
                  bgcolor: '#f6066f',
                  ...progressSx,
                }}
              />
            </Box>
          ) : null}
        </Box>

        {(showCaptions &&
          (activeItem?.caption ||
            activeItem?.title ||
            activeItem?.description)) ||
        (showPagination && count > 1) ? (
          <CardContent
            className="helix-media-carousel-card-content"
            sx={{
              display: isFullscreen ? 'none' : 'grid',
              gap: 2,
              p: { xs: 2, sm: 2.5, md: 3 },
              bgcolor: 'transparent',
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              '&:last-child': {
                pb: { xs: 2, sm: 2.5, md: 3 },
              },
            }}
          >
            {showCaptions &&
            (activeItem?.caption ||
              activeItem?.title ||
              activeItem?.description) ? (
              <Box
                {...slotProps?.caption}
                className={mergeClassNames(
                  'helix-media-carousel-caption',
                  slotProps?.caption?.className,
                )}
                sx={[
                  {
                    display: 'grid',
                    gap: 0.75,
                    bgcolor: 'transparent',
                    backgroundColor: 'transparent',
                    backgroundImage: 'none',
                  },
                  ...toSxArray(slotProps?.caption?.sx),
                ]}
              >
                {activeItem.title ? (
                  <Typography
                    component="h3"
                    sx={{
                      color: 'common.white',
                      fontSize: { xs: '1.1rem', md: '1.25rem' },
                      fontWeight: 800,
                      lineHeight: 1.25,
                    }}
                  >
                    {activeItem.title}
                  </Typography>
                ) : null}

                {activeItem.description ? (
                  <Typography
                    sx={{
                      color: 'rgba(205, 222, 241, 0.82)',
                      lineHeight: 1.65,
                    }}
                  >
                    {activeItem.description}
                  </Typography>
                ) : null}

                {activeItem.caption ? (
                  <Typography
                    sx={{
                      color: 'rgba(255, 255, 255, 0.64)',
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {activeItem.caption}
                  </Typography>
                ) : null}
              </Box>
            ) : null}

            {showPagination && count > 1 ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="center"
                {...slotProps?.pagination}
                className={mergeClassNames(
                  'helix-media-carousel-pagination',
                  slotProps?.pagination?.className,
                )}
                sx={[...toSxArray(slotProps?.pagination?.sx)]}
              >
                {slides.map((item, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <Box
                      key={`pagination-${getItemKey(item, index)}`}
                      component="button"
                      type="button"
                      aria-label={`Go to slide ${index + 1}`}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => goTo(index)}
                      {...slotProps?.paginationDot}
                      sx={[
                        {
                          width: isActive ? 34 : 10,
                          height: 10,
                          p: 0,
                          border: 0,
                          borderRadius: 999,
                          cursor: 'pointer',
                          bgcolor: isActive
                            ? '#f6066f'
                            : 'rgba(255, 255, 255, 0.28)',
                          boxShadow: isActive
                            ? '0 0 18px rgba(246, 6, 111, 0.55)'
                            : 'none',
                          transition:
                            'width 180ms ease, background-color 180ms ease, box-shadow 180ms ease',
                          '&:hover': {
                            bgcolor: isActive
                              ? '#f6066f'
                              : 'rgba(255, 255, 255, 0.48)',
                          },
                        },
                        ...toSxArray(slotProps?.paginationDot?.sx),
                      ]}
                    />
                  );
                })}

                <Typography
                  component="span"
                  sx={{
                    pl: 1,
                    color: 'rgba(255, 255, 255, 0.58)',
                    fontSize: '0.82rem',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {activeIndex + 1}/{count}
                </Typography>
              </Stack>
            ) : null}
          </CardContent>
        ) : null}
      </Box>
    </Box>
  );
}

export default MediaCarousel;
