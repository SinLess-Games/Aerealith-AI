'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { StaticImageData } from 'next/image';

export type BackgroundImageSource = string | StaticImageData;
export type BackgroundMode = 'light' | 'dark';

export interface BackgroundImageProps {
  imageUrl: BackgroundImageSource;
  lightImageUrl?: BackgroundImageSource;
  darkImageUrl?: BackgroundImageSource;
  mode?: BackgroundMode;
  altText?: string;
  sx?: SxProps<Theme>;
  backgroundSx?: SxProps<Theme>;
  backgroundStyle?: React.CSSProperties;
  overlayOpacity?: number;
  lightOverlayOpacity?: number;
  darkOverlayOpacity?: number;
  blur?: number;
  priority?: boolean;
  quality?: number;
  objectPosition?: React.CSSProperties['objectPosition'];
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

function toCssUrl(source: BackgroundImageSource): string {
  if (typeof source === 'string') {
    return source;
  }

  return source.src;
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
  return mode === 'light' ? lightImageUrl ?? imageUrl : darkImageUrl ?? imageUrl;
}

function getColorSchemeSnapshot(): BackgroundMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function getColorSchemeServerSnapshot(): BackgroundMode {
  return 'dark';
}

function subscribeToColorScheme(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

  mediaQuery.addEventListener('change', onStoreChange);

  return () => {
    mediaQuery.removeEventListener('change', onStoreChange);
  };
}

export function BackgroundImage({
  imageUrl,
  lightImageUrl,
  darkImageUrl,
  mode,
  altText = '',
  sx,
  backgroundSx: _backgroundSx,
  backgroundStyle,
  overlayOpacity = 0.4,
  lightOverlayOpacity,
  darkOverlayOpacity,
  blur = 0,
  objectPosition = 'center',
  children,
}: BackgroundImageProps) {
  const systemMode = React.useSyncExternalStore(
    subscribeToColorScheme,
    getColorSchemeSnapshot,
    getColorSchemeServerSnapshot,
  );

  const resolvedMode = mode ?? systemMode;

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

  const backgroundColor = resolvedMode === 'light' ? '#ffffff' : '#050716';
  const overlayColor =
    resolvedMode === 'light'
      ? `rgba(255, 255, 255, ${safeOverlayOpacity})`
      : `rgba(0, 0, 0, ${safeOverlayOpacity})`;

  const foregroundSx: SxProps<Theme> = {
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
  };

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        isolation: 'isolate',
        backgroundColor,
      }}
    >
      <div
        aria-hidden={altText.length === 0}
        data-background-mode={resolvedMode}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          pointerEvents: 'none',
          backgroundColor,
          backgroundImage: `url("${toCssUrl(selectedImageUrl)}")`,
          backgroundSize: 'cover',
          backgroundPosition: objectPosition?.toString() ?? 'center',
          backgroundRepeat: 'no-repeat',
          filter: safeBlur > 0 ? `blur(${safeBlur}px)` : undefined,
          transform: safeBlur > 0 ? 'scale(1.02)' : undefined,
          ...backgroundStyle,
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundColor: overlayColor,
        }}
      />

      <Box sx={mergeSx(foregroundSx, sx)}>{children}</Box>
    </Box>
  );
}

export default BackgroundImage;