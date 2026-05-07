'use client';

import * as React from 'react';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

export type DevelopmentBannerFixedPosition = 'top' | 'bottom' | false;

export interface DevelopmentBannerProps {
  /** Custom banner title. */
  title?: string;

  /** Custom banner message. */
  message?: string;

  /** Optional styling overrides. */
  sx?: SxProps<Theme>;

  /** Whether the banner is fixed at top or bottom, or not fixed. */
  fixed?: DevelopmentBannerFixedPosition;

  /** Optional test id. */
  testId?: string;
}

function getFixedPositionSx(
  fixed: DevelopmentBannerFixedPosition,
): SxProps<Theme> {
  if (fixed === 'top') {
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: (theme) => theme.zIndex.snackbar,
    };
  }

  if (fixed === 'bottom') {
    return {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: (theme) => theme.zIndex.snackbar,
    };
  }

  return {};
}

function mergeSx(...values: Array<SxProps<Theme> | undefined>): SxProps<Theme> {
  const merged = values.flatMap((value) => {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  });

  return merged as SxProps<Theme>;
}

export function DevelopmentBanner({
  title = 'Under Development',
  message = 'This is a development environment. Features may be incomplete.',
  sx,
  fixed = false,
  testId = 'development-banner',
}: DevelopmentBannerProps) {
  const baseAlertSx: SxProps<Theme> = (theme) => ({
    borderRadius: 0,
    px: 2,
    py: 1,
    fontSize: '0.875rem',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    border: `1px solid ${alpha(theme.palette.info.main, 0.5)}`,
    bgcolor:
      theme.palette.mode === 'dark'
        ? alpha(theme.palette.info.dark, 0.15)
        : alpha(theme.palette.info.light, 0.25),
    color:
      theme.palette.mode === 'dark'
        ? theme.palette.info.light
        : theme.palette.info.dark,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  });

  return (
    <Alert
      data-testid={testId}
      icon={<AnnouncementIcon fontSize="small" />}
      severity="info"
      variant="outlined"
      sx={mergeSx(baseAlertSx, getFixedPositionSx(fixed), sx)}
    >
      <AlertTitle
        sx={{
          fontWeight: 600,
          mb: 0,
          lineHeight: 1.3,
        }}
      >
        {title}
      </AlertTitle>
      <span>{message}</span>
    </Alert>
  );
}

export default DevelopmentBanner;