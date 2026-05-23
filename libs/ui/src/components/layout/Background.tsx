'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';

import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';

import Image from 'next/image';

import type {
  BackgroundImageProps,
  BackgroundImageSource,
  BackgroundMode,
  BackgroundPreference,
  BackgroundUserSettings,
} from '../../types';
import { mergeSx } from '../../utils';

export type {
  BackgroundImageProps,
  BackgroundImageSource,
  BackgroundMode,
  BackgroundPreference,
  BackgroundUserSettings,
} from '../../types/background';

const DEFAULT_LOCAL_STORAGE_KEYS = [
  'helix.appearance',
  'helix.theme',
  'helix.colorScheme',
  'mui-mode',
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePreference(
  value: BackgroundPreference | string | null | undefined,
): BackgroundPreference | undefined {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === 'light' ||
    normalized === 'dark' ||
    normalized === 'system'
  ) {
    return normalized;
  }

  return undefined;
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
  return mode === 'light'
    ? lightImageUrl ?? imageUrl
    : darkImageUrl ?? imageUrl;
}

function readUserPreference(
  settings: BackgroundUserSettings | null | undefined,
): BackgroundPreference | undefined {
  if (!settings) {
    return undefined;
  }

  return (
    normalizePreference(settings.appearance) ??
    normalizePreference(settings.themeMode) ??
    normalizePreference(settings.colorScheme) ??
    normalizePreference(settings.mode)
  );
}

function readStoredPreference(
  keys: readonly string[] = DEFAULT_LOCAL_STORAGE_KEYS,
): BackgroundPreference | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  for (const key of keys) {
    try {
      const value = window.localStorage.getItem(key);
      const preference = normalizePreference(value);

      if (preference) {
        return preference;
      }
    } catch {
      // Ignore storage access failures.
    }
  }

  return undefined;
}

function getSystemColorSchemeSnapshot(): BackgroundMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function getSystemColorSchemeServerSnapshot(): BackgroundMode {
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

function subscribeToLocalStorage(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener('storage', onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
  };
}

export function BackgroundImage({
  imageUrl,
  lightImageUrl,
  darkImageUrl,
  mode,
  userSettings,
  useUserPreference = true,
  isLoggedIn,
  localStorageKeys = DEFAULT_LOCAL_STORAGE_KEYS,
  altText = '',
  rootSx,
  sx,
  backgroundSx,
  backgroundStyle,
  overlaySx,
  overlayStyle,
  overlayOpacity = 0.4,
  lightOverlayOpacity,
  darkOverlayOpacity,
  overlayGradient,
  blur = 0,
  scaleOnBlur = 1.02,
  priority = false,
  quality,
  sizes = '100vw',
  objectFit = 'cover',
  objectPosition = 'center',
  children,
  ...boxProps
}: BackgroundImageProps): React.ReactElement {
  const muiTheme = useTheme();

  const systemMode = React.useSyncExternalStore(
    subscribeToColorScheme,
    getSystemColorSchemeSnapshot,
    getSystemColorSchemeServerSnapshot,
  );

  const storedPreference = React.useSyncExternalStore(
    subscribeToLocalStorage,
    () => readStoredPreference(localStorageKeys) ?? 'system',
    () => 'system',
  );

  const viewerIsLoggedIn = isLoggedIn ?? Boolean(userSettings);
  const explicitPreference = normalizePreference(mode);
  const userPreference =
    useUserPreference && viewerIsLoggedIn
      ? readUserPreference(userSettings)
      : undefined;

  const resolvedPreference =
    explicitPreference && explicitPreference !== 'system'
      ? explicitPreference
      : userPreference && userPreference !== 'system'
        ? userPreference
        : storedPreference && storedPreference !== 'system'
          ? storedPreference
          : systemMode ?? muiTheme.palette.mode;

  const resolvedMode: BackgroundMode =
    resolvedPreference === 'light' ? 'light' : 'dark';

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
  const safeScale = Math.max(1, scaleOnBlur);

  const backgroundColor = resolvedMode === 'light' ? '#ffffff' : '#050716';

  const overlayColor =
    resolvedMode === 'light'
      ? alpha('#ffffff', safeOverlayOpacity)
      : alpha('#000000', safeOverlayOpacity);

  const foregroundSx = {
    position: 'relative',
    zIndex: 2,
    minHeight: '100vh',
  };

  const rootStyle = {
    ...boxProps.style,
  } as CSSProperties | undefined;

  return (
    <Box
      {...boxProps}
      data-background-mode={resolvedMode}
      data-background-preference={resolvedPreference}
      style={rootStyle}
      sx={mergeSx(
        {
          position: 'relative',
          minHeight: '100vh',
          isolation: 'isolate',
          overflowX: 'clip',
          backgroundColor,
        },
        rootSx,
      )}
    >
      <Box
        aria-hidden={altText.length === 0}
        sx={mergeSx(
          {
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            pointerEvents: 'none',
            backgroundColor,
            filter: safeBlur > 0 ? `blur(${safeBlur}px)` : undefined,
            transform: safeBlur > 0 ? `scale(${safeScale})` : undefined,
            transformOrigin: 'center',
          },
          backgroundSx,
        )}
        style={backgroundStyle}
      >
        <Image
          src={selectedImageUrl}
          alt={altText}
          fill
          priority={priority}
          quality={quality}
          sizes={sizes}
          aria-hidden={altText.length === 0}
          style={{
            objectFit,
            objectPosition,
          }}
        />
      </Box>

      {overlayGradient ? (
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            background: overlayGradient,
          }}
        />
      ) : null}

      <Box
        aria-hidden="true"
        sx={mergeSx(
          {
            position: 'fixed',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            backgroundColor: overlayColor,
          },
          overlaySx,
        )}
        style={overlayStyle}
      />

      <Box sx={mergeSx(foregroundSx, sx)}>{children}</Box>
    </Box>
  );
}

export default BackgroundImage;