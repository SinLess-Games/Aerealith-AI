'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Image, { type StaticImageData } from 'next/image';

export type BackgroundImageSource = string | StaticImageData;
export type BackgroundMode = 'light' | 'dark';

export interface BackgroundImageProps {
  /** Fallback background image URL or imported static image. */
  imageUrl: BackgroundImageSource;

  /** Optional light-mode background image. */
  lightImageUrl?: BackgroundImageSource;

  /** Optional dark-mode background image. */
  darkImageUrl?: BackgroundImageSource;

  /** Force a specific mode. When omitted, system preference is used. */
  mode?: BackgroundMode;

  /** Alt text for the image. Leave empty for decorative backgrounds. */
  altText?: string;

  /** Optional style overrides for the foreground wrapper. */
  sx?: SxProps<Theme>;

  /** Optional style overrides for the fixed background layer. */
  backgroundSx?: SxProps<Theme>;

  /** Optional overlay opacity. 0 = transparent, 1 = fully dark. */
  overlayOpacity?: number;

  /** Optional light-mode overlay opacity. */
  lightOverlayOpacity?: number;

  /** Optional dark-mode overlay opacity. */
  darkOverlayOpacity?: number;

  /** Optional background blur intensity in pixels. */
  blur?: number;

  /** Optional image priority for Next/Image. */
  priority?: boolean;

  /** Optional image quality for Next/Image. */
  quality?: number;

  /** CSS object-position value for the background image. */
  objectPosition?: React.CSSProperties['objectPosition'];

  /** Optional children to render above the background. */
  children?: React.ReactNode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mergeSx(
  base: SxProps<Theme>,
  override?: SxProps<Theme>,
): SxProps<Theme> {
  if (!override) {
    return base;
  }

  return [
    ...(Array.isArray(base) ? base : [base]),
    ...(Array.isArray(override) ? override : [override]),
  ] as SxProps<Theme>;
}

function getSystemMode(): BackgroundMode {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }

  return 'dark';
}

function resolveImageUrl({
  mode,
  imageUrl,
  lightImageUrl,
  darkImageUrl,
}: {
  mode: BackgroundMode;
  imageUrl: BackgroundImageSource;
  lightImageUrl?: BackgroundImageSource;
  darkImageUrl?: BackgroundImageSource;
}): BackgroundImageSource {
  if (mode === 'light') {
    return lightImageUrl ?? imageUrl;
  }

  return darkImageUrl ?? imageUrl;
}

/**
 * BackgroundImage
 *
 * Fixed full-viewport background image with system light/dark image support,
 * overlay, and optional blur. Foreground children render above the background.
 */
export function BackgroundImage({
  imageUrl,
  lightImageUrl,
  darkImageUrl,
  mode,
  altText = '',
  sx,
  backgroundSx,
  overlayOpacity = 0.4,
  lightOverlayOpacity,
  darkOverlayOpacity,
  blur = 0,
  priority = true,
  quality = 100,
  objectPosition = 'center',
  children,
}: BackgroundImageProps) {
  const [resolvedMode, setResolvedMode] = React.useState<BackgroundMode>(
    () => mode ?? 'dark',
  );

  React.useEffect(() => {
    if (mode) {
      setResolvedMode(mode);
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const updateMode = (): void => {
      setResolvedMode(mediaQuery.matches ? 'light' : 'dark');
    };

    updateMode();

    mediaQuery.addEventListener?.('change', updateMode);

    return () => {
      mediaQuery.removeEventListener?.('change', updateMode);
    };
  }, [mode]);

  const selectedImageUrl = resolveImageUrl({
    mode: resolvedMode,
    imageUrl,
    lightImageUrl,
    darkImageUrl,
  });

  const selectedOverlayOpacity =
    resolvedMode === 'light'
      ? lightOverlayOpacity ?? overlayOpacity
      : darkOverlayOpacity ?? overlayOpacity;

  const safeOverlayOpacity = clamp(selectedOverlayOpacity, 0, 1);
  const safeBlur = Math.max(0, blur);

  const backgroundLayerSx: SxProps<Theme> = {
    position: 'fixed',
    inset: 0,
    zIndex: -2,
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: resolvedMode === 'light' ? '#ffffff' : '#050716',

    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: 1,
      backgroundColor:
        resolvedMode === 'light'
          ? `rgba(255, 255, 255, ${safeOverlayOpacity})`
          : `rgba(0, 0, 0, ${safeOverlayOpacity})`,
      backdropFilter: safeBlur > 0 ? `blur(${safeBlur}px)` : undefined,
      WebkitBackdropFilter: safeBlur > 0 ? `blur(${safeBlur}px)` : undefined,
    },
  };

  const foregroundSx: SxProps<Theme> = {
    position: 'relative',
    zIndex: 0,
    minHeight: '100vh',
  };

  return (
    <>
      <Box
        aria-hidden={altText.length === 0}
        data-background-mode={resolvedMode}
        sx={mergeSx(backgroundLayerSx, backgroundSx)}
      >
        <Image
          key={resolvedMode}
          src={selectedImageUrl}
          alt={altText}
          fill
          priority={priority}
          quality={quality}
          sizes="100vw"
          style={{
            objectFit: 'cover',
            objectPosition,
          }}
        />
      </Box>

      <Box sx={mergeSx(foregroundSx, sx)}>{children}</Box>
    </>
  );
}

export default BackgroundImage;