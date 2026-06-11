// libs/ui/src/components/layout/Background.tsx

'use client';

import type { CSSProperties } from 'react';
import * as React from 'react';

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
  BackgroundUserSettings
} from '../../types/background';

const DEFAULT_LOCAL_STORAGE_KEYS = [
  'helix.appearance',
  'helix.theme',
  'helix.colorScheme',
  'mui-mode',
] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizePreference(
  value: BackgroundPreference | string | null | undefined,
): BackgroundPreference | undefined {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

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

function readDocumentPreference(): BackgroundPreference | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const root = document.documentElement;

  const datasetPreference = normalizePreference(root.dataset.theme);

  if (datasetPreference) {
    return datasetPreference;
  }

  const themeAttributePreference = normalizePreference(
    root.getAttribute('data-theme'),
  );

  if (themeAttributePreference) {
    return themeAttributePreference;
  }

  const muiColorSchemePreference = normalizePreference(
    root.getAttribute('data-mui-color-scheme'),
  );

  if (muiColorSchemePreference) {
    return muiColorSchemePreference;
  }

  if (root.classList.contains('light')) {
    return 'light';
  }

  if (root.classList.contains('dark')) {
    return 'dark';
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

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onStoreChange);

    return () => {
      mediaQuery.removeEventListener('change', onStoreChange);
    };
  }

  mediaQuery.addListener(onStoreChange);

  return () => {
    mediaQuery.removeListener(onStoreChange);
  };
}

function subscribeToLocalStorage(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener('storage', onStoreChange);
  window.addEventListener('helix-theme-change', onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener('helix-theme-change', onStoreChange);
  };
}

function subscribeToDocumentPreference(onStoreChange: () => void): () => void {
  if (
    typeof document === 'undefined' ||
    typeof MutationObserver === 'undefined'
  ) {
    return () => undefined;
  }

  const observer = new MutationObserver(onStoreChange);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-mui-color-scheme'],
  });

  return () => {
    observer.disconnect();
  };
}

function resolveBackgroundMode(
  preference: BackgroundPreference | undefined,
  systemMode: BackgroundMode,
): BackgroundMode {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return systemMode;
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
    (): BackgroundPreference =>
      readStoredPreference(localStorageKeys) ?? 'system',
    (): BackgroundPreference => 'system',
  );

  const documentPreference = React.useSyncExternalStore(
    subscribeToDocumentPreference,
    (): BackgroundPreference => readDocumentPreference() ?? 'system',
    (): BackgroundPreference => 'system',
  );

  const viewerIsLoggedIn = isLoggedIn ?? Boolean(userSettings);
  const explicitPreference = normalizePreference(mode);
  const userPreference =
    useUserPreference && viewerIsLoggedIn
      ? readUserPreference(userSettings)
      : undefined;

  const muiPreference = normalizePreference(muiTheme.palette.mode);

  const resolvedPreference: BackgroundPreference =
    explicitPreference ??
    userPreference ??
    documentPreference ??
    storedPreference ??
    muiPreference ??
    'dark';

  const resolvedMode = resolveBackgroundMode(resolvedPreference, systemMode);

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
  const safeBlur = Math.max(0, Number.isFinite(blur) ? blur : 0);
  const safeScale = Math.max(
    1,
    Number.isFinite(scaleOnBlur) ? scaleOnBlur : 1,
  );

  const backgroundColor =
    resolvedMode === 'light'
      ? muiTheme.palette.background.default || '#f7f4ff'
      : muiTheme.palette.background.default || '#050716';

  const overlayColor =
    resolvedMode === 'light'
      ? alpha('#ffffff', safeOverlayOpacity)
      : alpha('#000000', safeOverlayOpacity);

  const foregroundSx = {
    position: 'relative',
    zIndex: 2,
    minHeight: '100dvh',
  };

  const rootStyle = boxProps.style
    ? ({ ...boxProps.style } as CSSProperties)
    : undefined;

  const imageStyle = React.useMemo<CSSProperties>(
    () => ({
      objectFit,
      objectPosition,
      userSelect: 'none',
      color: 'transparent',
    }),
    [objectFit, objectPosition],
  );

  return (
    <Box
      {...boxProps}
      data-background-mode={resolvedMode}
      data-background-preference={resolvedPreference}
      data-darkreader-ignore
      suppressHydrationWarning
      style={rootStyle}
      sx={mergeSx(
        {
          position: 'relative',
          minHeight: '100dvh',
          isolation: 'isolate',
          overflowX: 'clip',
          backgroundColor,
        },
        rootSx,
      )}
    >
      <Box
        aria-hidden={altText.length === 0}
        data-darkreader-ignore
        suppressHydrationWarning
        sx={mergeSx(
          {
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            width: '100vw',
            height: '100dvh',
            overflow: 'hidden',
            pointerEvents: 'none',
            backgroundColor,
            filter: safeBlur > 0 ? `blur(${safeBlur}px)` : undefined,
            transform: safeBlur > 0 ? `scale(${safeScale})` : undefined,
            transformOrigin: 'center',
            willChange: safeBlur > 0 ? 'filter, transform' : undefined,
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
          data-darkreader-ignore
          draggable={false}
          suppressHydrationWarning
          style={imageStyle}
        />
      </Box>

      {overlayGradient ? (
        <Box
          aria-hidden="true"
          data-darkreader-ignore
          suppressHydrationWarning
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
        data-darkreader-ignore
        suppressHydrationWarning
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

      <Box
        data-darkreader-ignore
        suppressHydrationWarning
        sx={mergeSx(foregroundSx, sx)}
      >
        {children}
      </Box>
    </Box>
  );
}

export default BackgroundImage;
