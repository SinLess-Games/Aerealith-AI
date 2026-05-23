// libs/ui/src/components/media/image.tsx

'use client';

import * as React from 'react';

import CloseIcon from '@mui/icons-material/Close';
import { Box, IconButton } from '@mui/material';
import Image from 'next/image';

import type { MediaImageProps } from '../../types';
import { mergeSx } from '../../utils';

export function MediaImage({
  src,
  alt,
  width,
  height,
  fill,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px',
  quality,
  priority,
  loading,
  placeholder,
  blurDataURL,
  unoptimized,
  aspectRatio = '16 / 9',
  objectFit = 'cover',
  objectPosition = 'center',
  rounded = true,
  bordered = true,
  elevated = true,
  fullscreenOnClick = true,
  showFullscreenCloseButton = true,
  closeFullscreenLabel = 'Exit fullscreen',
  imageProps,
  sx,
  onClick,
  onKeyDown,
  ...boxProps
}: MediaImageProps): React.ReactElement {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const borderRadius =
    rounded === true ? { xs: 3, md: 4 } : rounded === false ? 0 : rounded;

  const shouldFill = fill ?? (!width || !height);

  const enterFullscreen = React.useCallback(async () => {
    if (
      !fullscreenOnClick ||
      !rootRef.current ||
      !rootRef.current.requestFullscreen ||
      document.fullscreenElement
    ) {
      return;
    }

    await rootRef.current.requestFullscreen();
  }, [fullscreenOnClick]);

  const exitFullscreen = React.useCallback(async () => {
    if (!document.fullscreenElement || !document.exitFullscreen) {
      return;
    }

    await document.exitFullscreen();
  }, []);

  React.useEffect(() => {
    function handleFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    }

    handleFullscreenChange();

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(event);

      if (event.defaultPrevented || isFullscreen || !fullscreenOnClick) {
        return;
      }

      void enterFullscreen();
    },
    [enterFullscreen, fullscreenOnClick, isFullscreen, onClick],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (
        fullscreenOnClick &&
        !isFullscreen &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        void enterFullscreen();
      }

      if (isFullscreen && event.key === 'Escape') {
        event.preventDefault();
        void exitFullscreen();
      }
    },
    [enterFullscreen, exitFullscreen, fullscreenOnClick, isFullscreen, onKeyDown],
  );

  return (
    <Box
      {...boxProps}
      ref={rootRef}
      role={fullscreenOnClick ? 'button' : boxProps.role}
      tabIndex={fullscreenOnClick ? (boxProps.tabIndex ?? 0) : boxProps.tabIndex}
      aria-label={
        boxProps['aria-label'] ??
        (fullscreenOnClick ? `Open ${alt} fullscreen` : undefined)
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={mergeSx(
        {
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          aspectRatio: shouldFill ? aspectRatio : undefined,
          borderRadius,
          border: bordered ? 1 : 0,
          borderColor: bordered ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
          bgcolor: 'rgba(255, 255, 255, 0.035)',
          boxShadow: elevated
            ? '0 24px 76px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            : undefined,
          cursor: fullscreenOnClick ? 'zoom-in' : undefined,
          transition:
            'box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease, background-color 180ms ease',

          '&:hover': {
            borderColor: bordered
              ? 'rgba(246, 6, 111, 0.42)'
              : 'rgba(246, 6, 111, 0.28)',
            bgcolor: 'rgba(255, 255, 255, 0.055)',
            boxShadow:
              '0 0 0 1px rgba(246, 6, 111, 0.22), 0 0 34px rgba(246, 6, 111, 0.32), 0 22px 72px rgba(2, 35, 113, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            transform: fullscreenOnClick ? 'translateY(-1px)' : undefined,
          },

          '&:focus-visible': {
            outline: '3px solid rgba(246, 6, 111, 0.55)',
            outlineOffset: 3,
          },

          '&:fullscreen': {
            width: '100vw !important',
            maxWidth: '100vw !important',
            height: '100dvh !important',
            maxHeight: '100dvh !important',
            aspectRatio: 'auto !important',
            display: 'grid !important',
            placeItems: 'center !important',
            p: { xs: 1, md: 2 },
            border: '0 !important',
            borderRadius: '0 !important',
            bgcolor: '#000 !important',
            boxShadow: 'none !important',
            cursor: 'default',
            overflow: 'hidden !important',
            transform: 'none !important',
          },

          '&:fullscreen img': {
            objectFit: 'contain !important',
            objectPosition: 'center center !important',
            borderRadius: '0 !important',
          },

          '&:fullscreen img[data-nimg="fill"], &:fullscreen img[style*="position: absolute"]':
            {
              position: 'absolute !important',
              inset: '0 !important',
              width: '100% !important',
              height: '100% !important',
              maxWidth: '100% !important',
              maxHeight: '100% !important',
              objectFit: 'contain !important',
              objectPosition: 'center center !important',
            },
        },
        sx,
      )}
    >
      {isFullscreen && showFullscreenCloseButton ? (
        <IconButton
          type="button"
          aria-label={closeFullscreenLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void exitFullscreen();
          }}
          sx={{
            position: 'absolute',
            top: { xs: 12, md: 20 },
            right: { xs: 12, md: 20 },
            zIndex: 10,
            width: { xs: 42, md: 48 },
            height: { xs: 42, md: 48 },
            color: '#fff',
            bgcolor: 'rgba(0, 0, 0, 0.56)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',

            '&:hover': {
              bgcolor: 'rgba(246, 6, 111, 0.72)',
              borderColor: 'rgba(255, 255, 255, 0.36)',
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      ) : null}

      <Image
        src={src}
        alt={alt}
        width={shouldFill ? undefined : width}
        height={shouldFill ? undefined : height}
        fill={shouldFill}
        sizes={sizes}
        quality={quality}
        priority={priority}
        loading={loading}
        placeholder={placeholder}
        blurDataURL={blurDataURL}
        unoptimized={unoptimized}
        {...imageProps}
        style={{
          display: 'block',
          width: shouldFill ? undefined : '100%',
          height: shouldFill ? undefined : 'auto',
          objectFit: isFullscreen ? 'contain' : objectFit,
          objectPosition,
          borderRadius: 'inherit',
          ...imageProps?.style,
        }}
      />
    </Box>
  );
}

export default MediaImage;