// libs/ui/src/theme/mui.ts

import {
  alpha,
  createTheme,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles';

import type { ModeColorTokens, MuiBreakpointsWithProductionKeys, ThemeFontTokens, Mode as ThemeMode } from '../types';
import { AEREALITH_PALETTE, HELIX_COLORS, HelixFonts } from './constants';

const DEFAULT_MODE: ThemeMode = 'dark';


function resolveMode(mode: ThemeMode | string | null | undefined): ThemeMode {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return DEFAULT_MODE;
}

function resolveFonts(): {
  display: string;
  body: string;
  mono: string;
} {
  const fonts = HelixFonts as ThemeFontTokens;

  return {
    display:
      fonts.DISPLAY ??
      fonts.INTER ??
      'var(--font-space-grotesk, "Space Grotesk", system-ui, sans-serif)',
    body:
      fonts.BODY ??
      fonts.INTER ??
      'var(--font-inter, "Inter", system-ui, sans-serif)',
    mono:
      fonts.MONO ??
      'var(--font-jetbrains-mono, "JetBrains Mono", "Fira Code", monospace)',
  };
}

function getDefaultModeColors(mode: ThemeMode): ModeColorTokens {
  const isDark = mode === 'dark';

  return {
    primary: AEREALITH_PALETTE.pink,
    primaryForeground: AEREALITH_PALETTE.softStarlight,

    secondary: AEREALITH_PALETTE.etherCyan,
    secondaryForeground: AEREALITH_PALETTE.deepNight,

    background: isDark
      ? AEREALITH_PALETTE.deepNight
      : AEREALITH_PALETTE.softStarlight,

    surface: isDark ? AEREALITH_PALETTE.voidNavy : '#FFFFFF',

    border: isDark
      ? alpha(AEREALITH_PALETTE.mistGray, 0.22)
      : alpha(AEREALITH_PALETTE.mistGray, 0.56),

    textPrimary: isDark
      ? AEREALITH_PALETTE.softStarlight
      : AEREALITH_PALETTE.deepNight,

    textSecondary: isDark ? AEREALITH_PALETTE.mistGray : '#4D566B',

    signature: AEREALITH_PALETTE.pink,
    intelligence: AEREALITH_PALETTE.etherCyan,
    creativity: AEREALITH_PALETTE.auroraViolet,
    depth: AEREALITH_PALETTE.deepNight,
    neutral: AEREALITH_PALETTE.mistGray,
  };
}

function resolveColors(mode: ThemeMode): ModeColorTokens {
  const defaults = getDefaultModeColors(mode);
  const source = HELIX_COLORS[mode] as Partial<ModeColorTokens>;

  /**
   * Supports both the newer Aerealith token object and the older Helix token
   * object. If the richer tokens are unavailable, this file still renders the
   * new Aerealith theme instead of falling back to the older purple/cyan theme.
   */
  const hasAerealithTokens =
    typeof source.signature === 'string' ||
    typeof source.intelligence === 'string' ||
    typeof source.creativity === 'string';

  if (!hasAerealithTokens) {
    return defaults;
  }

  return {
    ...defaults,
    ...source,
  };
}

function toRgb(color: string): string {
  const normalized = color.trim().replace(/^#/, '').slice(0, 6);

  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return color;
  }

  const numericValue = Number.parseInt(normalized, 16);
  const red = (numericValue >> 16) & 255;
  const green = (numericValue >> 8) & 255;
  const blue = numericValue & 255;

  return `rgb(${red}, ${green}, ${blue})`;
}

function createRootCssVars(
  colors: ModeColorTokens,
  mode: ThemeMode,
): Record<string, string> {
  const isDark = mode === 'dark';

  return {
    '--hx-bg': colors.background,
    '--hx-bg-rgb': toRgb(colors.background),
    '--hx-bg-transparent': isDark
      ? 'rgba(5, 10, 30, 0.78)'
      : 'rgba(247, 244, 255, 0.76)',

    '--hx-surface': colors.surface,
    '--hx-surface-rgb': toRgb(colors.surface),
    '--hx-surface-transparent': isDark
      ? 'rgba(8, 7, 27, 0.74)'
      : 'rgba(255, 255, 255, 0.82)',

    '--hx-border': colors.border,
    '--hx-border-rgb': toRgb(colors.neutral),

    '--hx-text': colors.textPrimary,
    '--hx-text-rgb': toRgb(colors.textPrimary),
    '--hx-text-2': colors.textSecondary,
    '--hx-text-2-rgb': toRgb(colors.textSecondary),

    '--hx-primary': colors.primary,
    '--hx-primary-rgb': toRgb(colors.primary),
    '--hx-primary-foreground': colors.primaryForeground,

    '--hx-secondary': colors.secondary,
    '--hx-secondary-rgb': toRgb(colors.secondary),
    '--hx-secondary-foreground': colors.secondaryForeground,

    '--hx-accent': colors.secondary,
    '--hx-accent-rgb': toRgb(colors.secondary),
    '--hx-accent-foreground': colors.secondaryForeground,

    '--hx-aerealith-pink': AEREALITH_PALETTE.pink,
    '--hx-ether-cyan': AEREALITH_PALETTE.etherCyan,
    '--hx-deep-night': AEREALITH_PALETTE.deepNight,
    '--hx-void-navy': AEREALITH_PALETTE.voidNavy,
    '--hx-aurora-violet': AEREALITH_PALETTE.auroraViolet,
    '--hx-soft-starlight': AEREALITH_PALETTE.softStarlight,
    '--hx-mist-gray': AEREALITH_PALETTE.mistGray,

    '--hx-signature': colors.signature,
    '--hx-intelligence': colors.intelligence,
    '--hx-creativity': colors.creativity,
    '--hx-depth': colors.depth,
    '--hx-neutral': colors.neutral,

    '--hx-glass-bg': isDark
      ? 'rgba(8, 7, 27, 0.74)'
      : 'rgba(255, 255, 255, 0.82)',
    '--hx-glass-brd': colors.border,
    '--hx-glass-highlight': isDark
      ? 'rgba(247, 244, 255, 0.08)'
      : 'rgba(255, 255, 255, 0.72)',

    '--hx-glow-primary': isDark
      ? '0 0 32px rgba(246, 6, 111, 0.42)'
      : '0 0 28px rgba(246, 6, 111, 0.24)',
    '--hx-glow-secondary': isDark
      ? '0 0 34px rgba(0, 219, 201, 0.34)'
      : '0 0 28px rgba(0, 219, 201, 0.24)',
    '--hx-glow-violet': isDark
      ? '0 0 34px rgba(140, 82, 255, 0.36)'
      : '0 0 28px rgba(140, 82, 255, 0.22)',

    '--hx-shadow': isDark
      ? '0 20px 60px rgba(0, 0, 0, 0.48)'
      : '0 18px 48px rgba(5, 10, 30, 0.14)',
    '--hx-shadow-soft': isDark
      ? '0 14px 40px rgba(0, 0, 0, 0.32)'
      : '0 12px 34px rgba(5, 10, 30, 0.1)',

    '--hx-gradient-brand':
      'linear-gradient(135deg, #F6066F 0%, #8C52FF 48%, #00DBC9 100%)',
    '--hx-gradient-surface': isDark
      ? 'linear-gradient(145deg, rgba(8, 7, 27, 0.94) 0%, rgba(5, 10, 30, 0.92) 100%)'
      : 'linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(247, 244, 255, 0.86) 100%)',
    '--hx-gradient-page': isDark
      ? 'radial-gradient(circle at top left, rgba(246, 6, 111, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(0, 219, 201, 0.14), transparent 32%), radial-gradient(circle at bottom center, rgba(140, 82, 255, 0.16), transparent 42%), #050A1E'
      : 'radial-gradient(circle at top left, rgba(246, 6, 111, 0.1), transparent 34%), radial-gradient(circle at top right, rgba(0, 219, 201, 0.12), transparent 32%), radial-gradient(circle at bottom center, rgba(140, 82, 255, 0.12), transparent 42%), #F7F4FF',
  };
}

export function getMuiTheme(mode: ThemeMode | string = DEFAULT_MODE): Theme {
  const resolvedMode = resolveMode(mode);
  const isDark = resolvedMode === 'dark';
  const colors = resolveColors(resolvedMode);
  const fonts = resolveFonts();
  const rootCssVars = createRootCssVars(colors, resolvedMode);

  const focusRing = `0 0 0 3px ${alpha(
    colors.secondary,
    isDark ? 0.24 : 0.22,
  )}`;

  const interactiveTransition =
    'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease, transform 180ms ease';

  const glassSurface = {
    backgroundImage: 'var(--hx-gradient-surface)',
    backgroundColor: 'var(--hx-glass-bg)',
    border: `1px solid ${colors.border}`,
    backdropFilter: 'saturate(180%) blur(18px)',
    WebkitBackdropFilter: 'saturate(180%) blur(18px)',
  };

  const themeOptions: ThemeOptions = {
    palette: {
      mode: resolvedMode,

      common: {
        black: '#000000',
        white: AEREALITH_PALETTE.softStarlight,
      },

      primary: {
        main: colors.primary,
        light: '#FF4C97',
        dark: '#B8004F',
        contrastText: colors.primaryForeground,
      },

      secondary: {
        main: colors.secondary,
        light: '#51FFF2',
        dark: '#008B80',
        contrastText: colors.secondaryForeground,
      },

      info: {
        main: colors.secondary,
        light: '#51FFF2',
        dark: '#008B80',
        contrastText: colors.secondaryForeground,
      },

      success: {
        main: '#2EF2A3',
        light: '#74FFC6',
        dark: '#00A86B',
        contrastText: AEREALITH_PALETTE.deepNight,
      },

      warning: {
        main: '#FFB86C',
        light: '#FFD29B',
        dark: '#C77822',
        contrastText: AEREALITH_PALETTE.deepNight,
      },

      error: {
        main: '#FF4D7D',
        light: '#FF86A8',
        dark: '#C61F4E',
        contrastText: AEREALITH_PALETTE.softStarlight,
      },

      background: {
        default: colors.background,
        paper: colors.surface,
      },

      text: {
        primary: colors.textPrimary,
        secondary: colors.textSecondary,
        disabled: alpha(colors.textSecondary, isDark ? 0.42 : 0.5),
      },

      divider: isDark
        ? alpha(AEREALITH_PALETTE.mistGray, 0.2)
        : alpha(AEREALITH_PALETTE.deepNight, 0.12),

      action: {
        active: colors.secondary,
        hover: alpha(colors.secondary, isDark ? 0.08 : 0.1),
        selected: alpha(colors.creativity, isDark ? 0.18 : 0.14),
        disabled: alpha(colors.textSecondary, isDark ? 0.36 : 0.42),
        disabledBackground: alpha(colors.textSecondary, isDark ? 0.1 : 0.14),
        focus: alpha(colors.secondary, isDark ? 0.24 : 0.18),
      },
    },

    typography: {
      fontFamily: fonts.body,

      h1: {
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: 'clamp(2.75rem, 7vw, 6rem)',
        lineHeight: 0.96,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      },

      h2: {
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: 'clamp(2.25rem, 5vw, 4.75rem)',
        lineHeight: 1,
        letterSpacing: '0.035em',
        textTransform: 'uppercase',
      },

      h3: {
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: 'clamp(1.875rem, 3.5vw, 3.25rem)',
        lineHeight: 1.08,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      },

      h4: {
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: 'clamp(1.5rem, 2.5vw, 2.35rem)',
        lineHeight: 1.14,
        letterSpacing: '0.025em',
      },

      h5: {
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: '1.35rem',
        lineHeight: 1.22,
        letterSpacing: '0.02em',
      },

      h6: {
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: '1.1rem',
        lineHeight: 1.28,
        letterSpacing: '0.018em',
      },

      subtitle1: {
        fontFamily: fonts.body,
        fontWeight: 500,
        lineHeight: 1.65,
        color: colors.textSecondary,
      },

      subtitle2: {
        fontFamily: fonts.body,
        fontWeight: 600,
        lineHeight: 1.55,
        color: colors.textSecondary,
      },

      body1: {
        fontFamily: fonts.body,
        fontWeight: 400,
        lineHeight: 1.75,
      },

      body2: {
        fontFamily: fonts.body,
        fontWeight: 400,
        lineHeight: 1.7,
      },

      button: {
        fontFamily: fonts.display,
        textTransform: 'uppercase',
        fontWeight: 800,
        letterSpacing: '0.08em',
      },

      overline: {
        fontFamily: fonts.mono,
        fontWeight: 700,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      },

      caption: {
        fontFamily: fonts.mono,
        letterSpacing: '0.025em',
        color: colors.textSecondary,
      },
    },

    shape: {
      borderRadius: 18,
    },

    breakpoints: {
      values: {
        xs: 0,
        sm: 640,
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            ...rootCssVars,
            colorScheme: resolvedMode,
          },

          html: {
            minHeight: '100%',
            scrollBehavior: 'smooth',
            backgroundColor: colors.background,
          },

          body: {
            minHeight: '100%',
            margin: 0,
            backgroundColor: colors.background,
            backgroundImage: 'var(--hx-gradient-page)',
            backgroundAttachment: 'fixed',
            backgroundRepeat: 'no-repeat',
            color: colors.textPrimary,
            fontFamily: fonts.body,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
            scrollbarColor: `${alpha(colors.textSecondary, 0.32)} transparent`,
          },

          '#__next': {
            minHeight: '100%',
          },

          '*': {
            boxSizing: 'border-box',
          },

          '*::before, *::after': {
            boxSizing: 'border-box',
          },

          '::selection': {
            backgroundColor: alpha(colors.primary, isDark ? 0.38 : 0.28),
            color: colors.primaryForeground,
          },

          '::-webkit-scrollbar': {
            width: 10,
            height: 10,
          },

          '::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },

          '::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(colors.textSecondary, isDark ? 0.36 : 0.28),
            border: '2px solid transparent',
            borderRadius: 999,
            backgroundClip: 'content-box',
          },

          '::-webkit-scrollbar-thumb:hover': {
            backgroundColor: alpha(colors.secondary, isDark ? 0.62 : 0.48),
          },

          'a, button, input, textarea, select': {
            WebkitTapHighlightColor: 'transparent',
          },

          'button, [role="button"]': {
            cursor: 'pointer',
          },

          'button:disabled, [aria-disabled="true"]': {
            cursor: 'not-allowed',
          },

          'img, svg, video, canvas': {
            display: 'block',
            maxWidth: '100%',
          },

          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              scrollBehavior: 'auto !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },

      MuiButtonBase: {
        defaultProps: {
          disableRipple: false,
        },
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              boxShadow: focusRing,
            },
          },
        },
      },

      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: 999,
            paddingInline: 22,
            fontFamily: fonts.display,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            transition: interactiveTransition,

            '&:hover': {
              transform: 'translateY(-1px)',
            },

            '&:active': {
              transform: 'translateY(0)',
            },
          },

          sizeSmall: {
            minHeight: 36,
            paddingInline: 16,
            fontSize: '0.72rem',
          },

          sizeLarge: {
            minHeight: 52,
            paddingInline: 28,
            fontSize: '0.86rem',
          },

          contained: {
            backgroundImage: 'var(--hx-gradient-brand)',
            color: colors.primaryForeground,
            border: '1px solid transparent',
            boxShadow: isDark
              ? '0 0 24px rgba(246, 6, 111, 0.26)'
              : '0 12px 30px rgba(246, 6, 111, 0.2)',

            '&:hover': {
              backgroundImage: 'var(--hx-gradient-brand)',
              boxShadow: isDark
                ? '0 0 34px rgba(0, 219, 201, 0.3), 0 0 30px rgba(246, 6, 111, 0.26)'
                : '0 16px 34px rgba(5, 10, 30, 0.16)',
            },

            '&.Mui-disabled': {
              backgroundImage: 'none',
              backgroundColor: alpha(colors.textSecondary, isDark ? 0.12 : 0.18),
              color: alpha(colors.textPrimary, isDark ? 0.36 : 0.45),
            },
          },

          containedPrimary: {
            color: colors.primaryForeground,
          },

          containedSecondary: {
            backgroundImage: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.creativity} 100%)`,
            color: colors.secondaryForeground,
          },

          outlined: {
            color: colors.textPrimary,
            borderColor: colors.border,
            backgroundColor: alpha(colors.surface, isDark ? 0.34 : 0.58),
            backdropFilter: 'saturate(160%) blur(12px)',
            WebkitBackdropFilter: 'saturate(160%) blur(12px)',

            '&:hover': {
              borderColor: colors.secondary,
              backgroundColor: alpha(colors.secondary, isDark ? 0.1 : 0.12),
              boxShadow: `0 0 22px ${alpha(colors.secondary, isDark ? 0.2 : 0.16)}`,
            },
          },

          outlinedPrimary: {
            color: colors.primary,
            borderColor: alpha(colors.primary, 0.58),

            '&:hover': {
              color: colors.primary,
              borderColor: colors.primary,
              backgroundColor: alpha(colors.primary, isDark ? 0.1 : 0.08),
              boxShadow: `0 0 24px ${alpha(colors.primary, isDark ? 0.26 : 0.18)}`,
            },
          },

          outlinedSecondary: {
            color: colors.secondary,
            borderColor: alpha(colors.secondary, 0.54),

            '&:hover': {
              color: colors.secondary,
              borderColor: colors.secondary,
              backgroundColor: alpha(colors.secondary, isDark ? 0.1 : 0.08),
            },
          },

          text: {
            color: colors.textPrimary,

            '&:hover': {
              backgroundColor: alpha(colors.secondary, isDark ? 0.08 : 0.1),
              color: colors.secondary,
            },
          },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            color: colors.textSecondary,
            transition: interactiveTransition,

            '&:hover': {
              color: colors.secondary,
              backgroundColor: alpha(colors.secondary, isDark ? 0.1 : 0.12),
              boxShadow: `0 0 18px ${alpha(colors.secondary, isDark ? 0.22 : 0.14)}`,
              transform: 'translateY(-1px)',
            },

            '&:active': {
              transform: 'translateY(0)',
            },
          },
        },
      },

      MuiFab: {
        styleOverrides: {
          root: {
            backgroundImage: 'var(--hx-gradient-brand)',
            color: colors.primaryForeground,
            boxShadow: 'var(--hx-glow-primary), var(--hx-shadow-soft)',

            '&:hover': {
              backgroundImage: 'var(--hx-gradient-brand)',
              boxShadow: 'var(--hx-glow-secondary), var(--hx-shadow)',
            },
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            ...glassSurface,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 24,
            boxShadow: 'var(--hx-shadow-soft)',

            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'linear-gradient(135deg, rgba(247, 244, 255, 0.1), rgba(247, 244, 255, 0.02) 42%, rgba(0, 219, 201, 0.07))',
            },

            '& > *': {
              position: 'relative',
              zIndex: 1,
            },
          },
        },
      },

      MuiCardHeader: {
        styleOverrides: {
          title: {
            fontFamily: fonts.display,
            fontWeight: 800,
            letterSpacing: '0.025em',
          },

          subheader: {
            color: colors.textSecondary,
          },
        },
      },

      MuiCardContent: {
        styleOverrides: {
          root: {
            '&:last-child': {
              paddingBottom: 24,
            },
          },
        },
      },

      MuiCardActionArea: {
        styleOverrides: {
          root: {
            borderRadius: 'inherit',

            '&.Mui-focusVisible': {
              boxShadow: focusRing,
            },
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: colors.surface,
            color: colors.textPrimary,
          },

          rounded: {
            borderRadius: 20,
          },

          elevation1: {
            boxShadow: 'var(--hx-shadow-soft)',
          },

          elevation2: {
            boxShadow: 'var(--hx-shadow)',
          },
        },
      },

      MuiAppBar: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            ...glassSurface,
            color: colors.textPrimary,
            boxShadow: 'none',
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            ...glassSurface,
            color: colors.textPrimary,
          },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            ...glassSurface,
            borderRadius: 28,
            boxShadow: 'var(--hx-shadow)',
          },
        },
      },

      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontFamily: fonts.display,
            fontWeight: 800,
            letterSpacing: '0.035em',
          },
        },
      },

      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: isDark
              ? 'rgba(1, 3, 12, 0.72)'
              : 'rgba(5, 10, 30, 0.28)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          },
        },
      },

      MuiMenu: {
        styleOverrides: {
          paper: {
            ...glassSurface,
            borderRadius: 18,
            boxShadow: 'var(--hx-shadow)',
          },

          list: {
            paddingBlock: 8,
          },
        },
      },

      MuiPopover: {
        styleOverrides: {
          paper: {
            ...glassSurface,
            borderRadius: 18,
            boxShadow: 'var(--hx-shadow)',
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            marginInline: 8,
            transition: interactiveTransition,

            '&:hover': {
              backgroundColor: alpha(colors.secondary, isDark ? 0.08 : 0.1),
              color: colors.secondary,
            },

            '&.Mui-selected': {
              backgroundColor: alpha(colors.creativity, isDark ? 0.16 : 0.12),
              color: colors.textPrimary,

              '&:hover': {
                backgroundColor: alpha(colors.creativity, isDark ? 0.22 : 0.16),
              },
            },
          },
        },
      },

      MuiLink: {
        styleOverrides: {
          root: {
            color: colors.secondary,
            fontWeight: 700,
            textDecorationColor: alpha(colors.secondary, 0.42),
            textUnderlineOffset: '0.2em',
            transition: 'color 180ms ease, text-decoration-color 180ms ease',

            '&:hover': {
              color: colors.primary,
              textDecorationColor: alpha(colors.primary, 0.68),
            },
          },
        },
      },

      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
      },

      MuiInputBase: {
        styleOverrides: {
          root: {
            color: colors.textPrimary,
          },

          input: {
            '&::placeholder': {
              color: alpha(colors.textSecondary, isDark ? 0.76 : 0.72),
              opacity: 1,
            },
          },
        },
      },

      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: colors.textSecondary,

            '&.Mui-focused': {
              color: colors.secondary,
            },
          },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: alpha(colors.surface, isDark ? 0.42 : 0.72),
            transition: interactiveTransition,

            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.border,
              transition: 'border-color 180ms ease, box-shadow 180ms ease',
            },

            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(colors.secondary, 0.7),
            },

            '&.Mui-focused': {
              backgroundColor: alpha(colors.surface, isDark ? 0.56 : 0.9),
              boxShadow: focusRing,
            },

            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.secondary,
              borderWidth: 1,
            },

            '&.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderColor: '#FF4D7D',
            },

            '&.Mui-disabled': {
              backgroundColor: alpha(colors.textSecondary, isDark ? 0.08 : 0.1),
            },
          },
        },
      },

      MuiFormHelperText: {
        styleOverrides: {
          root: {
            color: colors.textSecondary,
          },
        },
      },

      MuiSelect: {
        styleOverrides: {
          icon: {
            color: colors.textSecondary,
          },
        },
      },

      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: colors.textSecondary,

            '&.Mui-checked': {
              color: colors.secondary,
            },
          },
        },
      },

      MuiRadio: {
        styleOverrides: {
          root: {
            color: colors.textSecondary,

            '&.Mui-checked': {
              color: colors.secondary,
            },
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              color: colors.secondary,

              '& + .MuiSwitch-track': {
                backgroundColor: colors.secondary,
                opacity: 0.56,
              },
            },
          },

          track: {
            backgroundColor: alpha(colors.textSecondary, isDark ? 0.34 : 0.28),
          },
        },
      },

      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 46,
          },

          indicator: {
            height: 3,
            borderRadius: 999,
            backgroundImage: 'var(--hx-gradient-brand)',
            boxShadow: `0 0 18px ${alpha(colors.secondary, 0.38)}`,
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 46,
            fontFamily: fonts.display,
            fontWeight: 800,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: colors.textSecondary,

            '&.Mui-selected': {
              color: colors.textPrimary,
            },
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontFamily: fonts.mono,
            fontWeight: 700,
            letterSpacing: '0.04em',
          },

          filled: {
            backgroundColor: alpha(colors.secondary, isDark ? 0.14 : 0.16),
            color: colors.textPrimary,
          },

          outlined: {
            borderColor: colors.border,
            color: colors.textPrimary,
            backgroundColor: alpha(colors.surface, isDark ? 0.24 : 0.5),
          },

          colorPrimary: {
            backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.12),
            color: colors.primary,
            borderColor: alpha(colors.primary, 0.34),
          },

          colorSecondary: {
            backgroundColor: alpha(colors.secondary, isDark ? 0.14 : 0.12),
            color: colors.secondary,
            borderColor: alpha(colors.secondary, 0.34),
          },
        },
      },

      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: colors.border,
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            ...glassSurface,
            color: colors.textPrimary,
            borderRadius: 12,
            padding: '8px 12px',
            fontFamily: fonts.body,
            fontSize: '0.78rem',
            boxShadow: 'var(--hx-shadow-soft)',
          },

          arrow: {
            color: isDark ? AEREALITH_PALETTE.voidNavy : '#FFFFFF',
          },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            border: `1px solid ${colors.border}`,
            backdropFilter: 'saturate(160%) blur(14px)',
            WebkitBackdropFilter: 'saturate(160%) blur(14px)',
          },

          standardInfo: {
            backgroundColor: alpha(colors.secondary, isDark ? 0.12 : 0.1),
            color: colors.textPrimary,
          },

          standardSuccess: {
            backgroundColor: alpha('#2EF2A3', isDark ? 0.12 : 0.14),
            color: colors.textPrimary,
          },

          standardWarning: {
            backgroundColor: alpha('#FFB86C', isDark ? 0.14 : 0.18),
            color: colors.textPrimary,
          },

          standardError: {
            backgroundColor: alpha('#FF4D7D', isDark ? 0.13 : 0.14),
            color: colors.textPrimary,
          },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: 8,
            borderRadius: 999,
            backgroundColor: alpha(colors.textSecondary, isDark ? 0.14 : 0.16),
            overflow: 'hidden',
          },

          bar: {
            borderRadius: 999,
            backgroundImage: 'var(--hx-gradient-brand)',
          },
        },
      },

      MuiCircularProgress: {
        styleOverrides: {
          root: {
            color: colors.secondary,
          },
        },
      },

      MuiSkeleton: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(colors.textSecondary, isDark ? 0.12 : 0.16),

            '&::after': {
              background:
                'linear-gradient(90deg, transparent, rgba(247, 244, 255, 0.14), transparent)',
            },
          },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: colors.border,
          },

          head: {
            fontFamily: fonts.mono,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.textSecondary,
          },
        },
      },
    },
  };

  const theme = createTheme(themeOptions);
  const breakpoints = theme.breakpoints as MuiBreakpointsWithProductionKeys;

  breakpoints.internal_mediaKeys = breakpoints.keys;

  return theme;
}
