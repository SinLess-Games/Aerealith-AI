import type { CSSProperties, ReactNode } from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { StaticImageData } from 'next/image';

export type BackgroundImageSource = string | StaticImageData;

export type BackgroundMode = 'light' | 'dark';

export type BackgroundPreference = BackgroundMode | 'system';

export type BackgroundUserSettings = {
  /**
   * Recommended user setting field.
   *
   * Supported values:
   * - light
   * - dark
   * - system
   */
  appearance?: BackgroundPreference | string | null;

  /**
   * Alternate setting names supported for compatibility.
   */
  themeMode?: BackgroundPreference | string | null;
  colorScheme?: BackgroundPreference | string | null;
  mode?: BackgroundPreference | string | null;
};

export interface BackgroundImageProps
  extends Omit<BoxProps, 'children' | 'sx'> {
  /**
   * Default background image.
   *
   * Used when no mode-specific image is supplied.
   */
  imageUrl: BackgroundImageSource;

  /**
   * Optional image used when the resolved background mode is light.
   */
  lightImageUrl?: BackgroundImageSource;

  /**
   * Optional image used when the resolved background mode is dark.
   */
  darkImageUrl?: BackgroundImageSource;

  /**
   * Explicit mode override.
   *
   * Resolution order:
   * 1. `mode`, unless set to `system`
   * 2. logged-in user settings preference
   * 3. local browser preference
   * 4. system color scheme
   * 5. MUI theme mode fallback
   */
  mode?: BackgroundPreference;

  /**
   * Logged-in user settings object.
   *
   * Example:
   * userSettings={{ appearance: user.settings.appearance }}
   */
  userSettings?: BackgroundUserSettings | null;

  /**
   * Whether to use `userSettings` when present.
   *
   * Defaults to true.
   */
  useUserPreference?: boolean;

  /**
   * Whether the current viewer is logged in.
   *
   * If omitted, this becomes true when `userSettings` exists.
   */
  isLoggedIn?: boolean;

  /**
   * Browser localStorage preference keys to check when no explicit/user
   * preference exists.
   */
  localStorageKeys?: readonly string[];

  /**
   * Background image alt text.
   *
   * Leave empty for decorative backgrounds.
   */
  altText?: string;

  /**
   * Root wrapper styles.
   */
  rootSx?: SxProps<Theme>;

  /**
   * Foreground/content wrapper styles.
   *
   * Kept as `sx` for standard MUI compatibility.
   */
  sx?: SxProps<Theme>;

  /**
   * Background image layer styles.
   */
  backgroundSx?: SxProps<Theme>;

  /**
   * Background image layer raw CSS style.
   */
  backgroundStyle?: CSSProperties;

  /**
   * Overlay layer styles.
   */
  overlaySx?: SxProps<Theme>;

  /**
   * Overlay layer raw CSS style.
   */
  overlayStyle?: CSSProperties;

  /**
   * Base overlay opacity used when no mode-specific opacity is supplied.
   */
  overlayOpacity?: number;

  /**
   * Overlay opacity used in light mode.
   */
  lightOverlayOpacity?: number;

  /**
   * Overlay opacity used in dark mode.
   */
  darkOverlayOpacity?: number;

  /**
   * Optional gradient layered above the image and below the solid overlay.
   */
  overlayGradient?: string;

  /**
   * Blur amount in pixels.
   */
  blur?: number;

  /**
   * Scale applied when blur is enabled to avoid edge clipping.
   */
  scaleOnBlur?: number;

  /**
   * Next.js image priority.
   */
  priority?: boolean;

  /**
   * Next.js image quality.
   */
  quality?: number;

  /**
   * Next.js image sizes.
   */
  sizes?: string;

  objectFit?: CSSProperties['objectFit'];
  objectPosition?: CSSProperties['objectPosition'];

  children?: ReactNode;
}
