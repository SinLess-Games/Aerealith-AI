// libs/ui/src/components/media/video-player.tsx

'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import {
  Box,
  Card,
  CardHeader,
  CircularProgress,
  Typography,
} from '@mui/material';

import type {
  CldVideoPlayerProps,
  VideoPlayerProps,
} from '../../types';
import { mergeSx } from '../../utils';
;

const DEFAULT_SOURCE_TYPES = ['mp4'] as const;

const DynamicCldVideoPlayer = dynamic<CldVideoPlayerProps>(
  () => import('next-cloudinary').then((mod) => mod.CldVideoPlayer),
  {
    ssr: false,
    loading: () => (
      <Box
        sx={{
          width: '100%',
          aspectRatio: '16 / 9',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(0, 0, 0, 0.35)',
          color: 'text.secondary',
        }}
      >
        <CircularProgress size={28} />
      </Box>
    ),
  },
);

function normalizeCloudinaryVideoSrc(
  src: CldVideoPlayerProps['src'],
): CldVideoPlayerProps['src'] {
  if (typeof src !== 'string') {
    return src;
  }

  if (!src.startsWith('http://') && !src.startsWith('https://')) {
    return src;
  }

  try {
    const url = new URL(src);

    if (!url.hostname.includes('res.cloudinary.com')) {
      return src;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => segment === 'upload');

    if (uploadIndex === -1) {
      return src;
    }

    const afterUpload = segments.slice(uploadIndex + 1);
    const versionIndex = afterUpload.findIndex((segment) =>
      /^v\d+$/.test(segment),
    );

    const publicIdSegments =
      versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;

    if (publicIdSegments.length === 0) {
      return src;
    }

    return publicIdSegments.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
  } catch {
    return src;
  }
}

function normalizeSourceTypes(
  sourceTypes?: readonly string[],
): readonly string[] {
  if (!Array.isArray(sourceTypes)) {
    return DEFAULT_SOURCE_TYPES;
  }

  const normalized = sourceTypes.filter(
    (sourceType): sourceType is string =>
      typeof sourceType === 'string' && sourceType.trim().length > 0,
  );

  return normalized.length > 0 ? normalized : DEFAULT_SOURCE_TYPES;
}

function createStableVideoId(
  src: CldVideoPlayerProps['src'],
  fallbackId: string,
): string {
  if (typeof src !== 'string') {
    return `helix-video-${fallbackId}`;
  }

  const normalized = normalizeCloudinaryVideoSrc(src);

  if (typeof normalized !== 'string') {
    return `helix-video-${fallbackId}`;
  }

  const safeId = normalized
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return safeId ? `helix-video-${safeId}` : `helix-video-${fallbackId}`;
}

export function VideoPlayer({
  id,
  src,
  width = '1920',
  height = '1080',
  title,
  description,
  poster,
  logo = false,
  card = true,
  cardProps,
  sx,
  playerSx,
  responsive = true,
  aspectRatio = '16 / 9',
  autoPlay,
  loop,
  muted,
  controls = true,
  playsinline,
  playsInline,
  transformation,
  sourceTypes,
  colors,
  className,
  quality,
  playerProps,
}: VideoPlayerProps): React.ReactElement {
  const reactId = React.useId().replace(/[^a-zA-Z0-9_-]+/g, '');
  const hasHeader = Boolean(title || description);

  const resolvedSrc = React.useMemo(
    () => normalizeCloudinaryVideoSrc(src),
    [src],
  );

  const resolvedId = React.useMemo(
    () => id ?? createStableVideoId(resolvedSrc, reactId),
    [id, reactId, resolvedSrc],
  );

  const resolvedSourceTypes = React.useMemo(
    () => normalizeSourceTypes(sourceTypes),
    [sourceTypes],
  );

  const resolvedPlaysinline = playsinline ?? playsInline ?? true;

  const player = (
    <Box
      sx={mergeSx(
        {
          width: '100%',
          overflow: 'hidden',
          borderRadius: card ? 0 : 2,
          bgcolor: 'background.default',

          ...(responsive
            ? {
                aspectRatio,
              }
            : null),

          '& .cld-video-player': {
            width: '100%',
            height: responsive ? '100%' : 'auto',
          },

          '& .cld-video-player video': {
            width: '100%',
            height: responsive ? '100%' : 'auto',
            display: 'block',
            objectFit: responsive ? 'cover' : 'contain',
          },

          '& video': {
            width: '100%',
            height: responsive ? '100%' : 'auto',
            display: 'block',
            objectFit: responsive ? 'cover' : 'contain',
          },
        },
        playerSx,
      )}
    >
      <DynamicCldVideoPlayer
        {...playerProps}
        id={resolvedId}
        width={width}
        height={height}
        src={resolvedSrc}
        poster={poster}
        logo={logo}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        controls={controls}
        playsinline={resolvedPlaysinline}
        transformation={transformation}
        sourceTypes={resolvedSourceTypes as CldVideoPlayerProps['sourceTypes']}
        colors={colors}
        className={className}
        quality={quality}
      />
    </Box>
  );

  if (!card) {
    return (
      <Box sx={sx}>
        {hasHeader ? (
          <Box sx={{ mb: 2 }}>
            {title ? (
              <Typography component="h2" variant="h5" fontWeight={700}>
                {title}
              </Typography>
            ) : null}

            {description ? (
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                {description}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {player}
      </Box>
    );
  }

  return (
    <Card
      elevation={0}
      {...cardProps}
      sx={mergeSx(
        {
          overflow: 'hidden',
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        },
        sx,
        cardProps?.sx,
      )}
    >
      {hasHeader ? (
        <CardHeader
          title={title}
          subheader={description}
          titleTypographyProps={{
            component: 'h2',
            variant: 'h5',
            fontWeight: 700,
          }}
          subheaderTypographyProps={{
            variant: 'body2',
            color: 'text.secondary',
          }}
        />
      ) : null}

      {player}
    </Card>
  );
}

export default VideoPlayer;