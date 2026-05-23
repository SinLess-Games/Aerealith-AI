// libs/ui/src/components/media/power-point-player.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type {
  PowerPointPlayerMode,
  PowerPointPlayerProps,
  PowerPointSlide,
} from '../../types';
import { mergeSx } from '../../utils';


function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isPowerPointUrl(value: string): boolean {
  return /\.(ppt|pptx)(?:[?#].*)?$/i.test(value);
}

function buildOfficeViewerUrl(src: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    src,
  )}`;
}

function clampSlideIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), count - 1);
}

function resolveMode({
  mode,
  src,
  slides,
}: {
  mode: PowerPointPlayerMode;
  src?: string;
  slides: readonly PowerPointSlide[];
}): PowerPointPlayerMode {
  if (mode !== 'auto') {
    return mode;
  }

  if (slides.length > 0) {
    return 'slides';
  }

  if (src && isAbsoluteHttpUrl(src) && isPowerPointUrl(src)) {
    return 'office';
  }

  return 'iframe';
}

function resolveFrameSrc({
  mode,
  src,
}: {
  mode: PowerPointPlayerMode;
  src?: string;
}): string | undefined {
  if (!src) {
    return undefined;
  }

  if (mode === 'office') {
    return buildOfficeViewerUrl(src);
  }

  return src;
}

export function PowerPointPlayer({
  id,
  src,
  mode = 'auto',
  title,
  description,
  slides = [],
  initialSlide = 0,
  iframeTitle,
  height = 640,
  aspectRatio = '16 / 9',
  loading = 'lazy',
  allowFullScreen = true,
  card = true,
  cardProps,
  downloadHref,
  downloadLabel = 'Download deck',
  openInNewTabLabel = 'Open deck',
  sx,
  frameSx,
  slideSx,
  actionsSx,
  onSlideChange,
}: PowerPointPlayerProps): React.ReactElement {
  const safeSlides = React.useMemo(() => [...slides], [slides]);
  const resolvedMode = resolveMode({
    mode,
    src,
    slides: safeSlides,
  });

  const [activeSlide, setActiveSlide] = React.useState(() =>
    clampSlideIndex(initialSlide, safeSlides.length),
  );

  React.useEffect(() => {
    setActiveSlide((current) => clampSlideIndex(current, safeSlides.length));
  }, [safeSlides.length]);

  const frameSrc = resolveFrameSrc({
    mode: resolvedMode,
    src,
  });

  const hasHeader = Boolean(title || description);
  const canUseSlides = resolvedMode === 'slides' && safeSlides.length > 0;
  const currentSlide = canUseSlides ? safeSlides[activeSlide] : undefined;

  const goToSlide = React.useCallback(
    (nextIndex: number): void => {
      const resolvedIndex = clampSlideIndex(nextIndex, safeSlides.length);
      const slide = safeSlides[resolvedIndex];

      setActiveSlide(resolvedIndex);

      if (slide) {
        onSlideChange?.(resolvedIndex, slide);
      }
    },
    [onSlideChange, safeSlides],
  );

  const goPrevious = React.useCallback((): void => {
    goToSlide(activeSlide - 1);
  }, [activeSlide, goToSlide]);

  const goNext = React.useCallback((): void => {
    goToSlide(activeSlide + 1);
  }, [activeSlide, goToSlide]);

  const showActions = Boolean(downloadHref || src);

  const actions = showActions ? (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      justifyContent="flex-end"
      sx={actionsSx}
    >
      {src ? (
        <Button
          component="a"
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          size="small"
          sx={{
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 800,
          }}
        >
          {openInNewTabLabel}
        </Button>
      ) : null}

      {downloadHref ? (
        <Button
          component="a"
          href={downloadHref}
          download
          variant="contained"
          size="small"
          sx={{
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 800,
          }}
        >
          {downloadLabel}
        </Button>
      ) : null}
    </Stack>
  ) : null;

  const player = canUseSlides ? (
    <Box
      sx={mergeSx(
        {
          width: '100%',
          overflow: 'hidden',
          borderRadius: card ? 0 : 3,
          border: card ? 0 : 1,
          borderColor: 'divider',
          bgcolor: 'rgba(0, 0, 0, 0.72)',
        },
        frameSx,
      )}
    >
      <Box
        sx={mergeSx(
          {
            position: 'relative',
            width: '100%',
            aspectRatio,
            minHeight: {
              xs: 320,
              md: height,
            },
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            bgcolor: 'common.black',
          },
          slideSx,
        )}
      >
        {currentSlide ? (
          <Box
            component="img"
            src={currentSlide.src}
            alt={currentSlide.alt}
            sx={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
            }}
          />
        ) : null}
      </Box>

      <CardContent
        sx={{
          display: 'grid',
          gap: 1.5,
          bgcolor: 'background.paper',
        }}
      >
        {currentSlide?.title || currentSlide?.description ? (
          <Box>
            {currentSlide.title ? (
              <Typography component="h3" variant="h6" fontWeight={800}>
                {currentSlide.title}
              </Typography>
            ) : null}

            {currentSlide.description ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {currentSlide.description}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
        >
          <Button
            type="button"
            variant="outlined"
            size="small"
            disabled={activeSlide <= 0}
            onClick={goPrevious}
            sx={{
              borderRadius: 999,
              textTransform: 'none',
              fontWeight: 800,
            }}
          >
            Previous
          </Button>

          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {activeSlide + 1} / {safeSlides.length}
          </Typography>

          <Button
            type="button"
            variant="outlined"
            size="small"
            disabled={activeSlide >= safeSlides.length - 1}
            onClick={goNext}
            sx={{
              borderRadius: 999,
              textTransform: 'none',
              fontWeight: 800,
            }}
          >
            Next
          </Button>
        </Stack>
      </CardContent>
    </Box>
  ) : frameSrc ? (
    <Box
      sx={mergeSx(
        {
          width: '100%',
          height,
          minHeight: {
            xs: 420,
            md: height,
          },
          overflow: 'hidden',
          borderRadius: card ? 0 : 3,
          border: card ? 0 : 1,
          borderColor: 'divider',
          bgcolor: 'rgba(0, 0, 0, 0.72)',
        },
        frameSx,
      )}
    >
      <Box
        component="iframe"
        id={id}
        title={
          iframeTitle ??
          (typeof title === 'string'
            ? title
            : 'Embedded PowerPoint presentation')
        }
        src={frameSrc}
        loading={loading}
        allowFullScreen={allowFullScreen}
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 0,
          bgcolor: 'common.black',
        }}
      />
    </Box>
  ) : (
    <Box
      sx={mergeSx(
        {
          width: '100%',
          minHeight: 320,
          display: 'grid',
          placeItems: 'center',
          p: 3,
          border: 1,
          borderColor: 'divider',
          borderRadius: card ? 0 : 3,
          bgcolor: 'background.paper',
          textAlign: 'center',
        },
        frameSx,
      )}
    >
      <Typography color="text.secondary">
        No presentation source or slides were provided.
      </Typography>
    </Box>
  );

  if (!card) {
    return (
      <Box sx={sx}>
        {hasHeader ? (
          <Box sx={{ mb: 2 }}>
            {title ? (
              <Typography component="h2" variant="h5" fontWeight={800}>
                {title}
              </Typography>
            ) : null}

            {description ? (
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {description}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {player}

        {actions ? <Box sx={{ mt: 2 }}>{actions}</Box> : null}
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
          action={actions}
          titleTypographyProps={{
            component: 'h2',
            variant: 'h5',
            fontWeight: 800,
          }}
          subheaderTypographyProps={{
            variant: 'body2',
            color: 'text.secondary',
          }}
        />
      ) : actions ? (
        <CardContent>{actions}</CardContent>
      ) : null}

      {player}
    </Card>
  );
}

export default PowerPointPlayer;