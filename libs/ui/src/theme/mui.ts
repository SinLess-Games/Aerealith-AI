// libs/ui/src/theme/mui.ts

import {
  alpha,
  createTheme,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles';

import { HELIX_COLORS, HelixFonts, type Mode } from './constants';

const DEFAULT_MODE: Mode = 'dark';

function resolveMode(mode: Mode | string | null | undefined): Mode {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return DEFAULT_MODE;
}

export function getMuiTheme(mode: Mode | string = DEFAULT_MODE): Theme {
  const resolvedMode = resolveMode(mode);
  const colors = HELIX_COLORS[resolvedMode];

  const themeOptions: ThemeOptions = {
    palette: {
      mode: resolvedMode,
      primary: {
        main: colors.primary,
        contrastText: resolvedMode === 'dark' ? '#130D29' : '#FFFFFF',
      },
      secondary: {
        main: colors.secondary,
        contrastText: resolvedMode === 'dark' ? '#052421' : '#082B38',
      },
      background: {
        default: colors.background,
        paper: colors.surface,
      },
      text: {
        primary: colors.textPrimary,
        secondary: colors.textSecondary,
      },
      divider: alpha(colors.textSecondary, resolvedMode === 'dark' ? 0.24 : 0.28),
    },

    typography: {
      fontFamily: HelixFonts.LORA,

      h1: {
        fontFamily: HelixFonts.PINYON,
        fontWeight: 600,
        letterSpacing: '0.01em',
      },
      h2: {
        fontFamily: HelixFonts.PINYON,
        fontWeight: 600,
        letterSpacing: '0.01em',
      },
      h3: {
        fontFamily: HelixFonts.LORA,
        fontWeight: 600,
      },
      h4: {
        fontFamily: HelixFonts.LORA,
        fontWeight: 600,
      },
      h5: {
        fontFamily: HelixFonts.LORA,
        fontWeight: 600,
      },
      h6: {
        fontFamily: HelixFonts.LORA,
        fontWeight: 600,
      },

      subtitle1: {
        fontFamily: HelixFonts.LORA,
      },
      subtitle2: {
        fontFamily: HelixFonts.LORA,
      },
      body1: {
        fontFamily: HelixFonts.LORA,
      },
      body2: {
        fontFamily: HelixFonts.LORA,
      },
      button: {
        fontFamily: HelixFonts.LORA,
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.05em',
      },
      overline: {
        fontFamily: HelixFonts.LORA,
        letterSpacing: '0.08em',
      },
      caption: {
        fontFamily: HelixFonts.LORA,
      },
    },

    shape: {
      borderRadius: 8,
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: resolvedMode,
          },
          body: {
            backgroundColor: colors.background,
            color: colors.textPrimary,
            fontFamily: HelixFonts.LORA,
          },
          '*': {
            boxSizing: 'border-box',
          },
          '::selection': {
            backgroundColor: alpha(colors.primary, 0.32),
            color: colors.textPrimary,
          },
        },
      },

      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition:
              'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, transform 0.2s ease',
            '&:hover': {
              boxShadow: `0 0 12px ${alpha(colors.primary, 0.5)}`,
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          },
          containedPrimary: {
            backgroundColor: colors.primary,
            color: resolvedMode === 'dark' ? '#130D29' : '#FFFFFF',
            '&:hover': {
              backgroundColor: colors.secondary,
              boxShadow: `0 0 16px ${alpha(colors.secondary, 0.5)}`,
            },
          },
          outlinedPrimary: {
            color: colors.primary,
            borderColor: alpha(colors.primary, 0.72),
            '&:hover': {
              borderColor: colors.secondary,
              color: colors.secondary,
              backgroundColor: alpha(colors.secondary, 0.08),
            },
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: colors.surface,
            border: `1px solid ${alpha(colors.textSecondary, 0.18)}`,
            boxShadow:
              resolvedMode === 'dark'
                ? '0 18px 50px rgba(0, 0, 0, 0.32)'
                : '0 18px 50px rgba(18, 24, 38, 0.1)',
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },

      MuiLink: {
        styleOverrides: {
          root: {
            color: colors.primary,
            textUnderlineOffset: '0.18em',
            transition: 'color 0.2s ease',
            '&:hover': {
              color: colors.secondary,
            },
          },
        },
      },

      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(colors.textSecondary, 0.32),
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(colors.primary, 0.72),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary,
              boxShadow: `0 0 0 3px ${alpha(colors.primary, 0.16)}`,
            },
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
}