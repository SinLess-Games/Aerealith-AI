// libs/ui/src/components/marketing/feature-grid.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type {
  FeatureGridAlign,
  FeatureGridColumns,
  FeatureGridItem,
  FeatureGridProps,
} from '../../types';
import { mergeSx } from '../../utils';
import FeatureCard from '../cards/feature-card';

export type {
  FeatureGridAlign,
  FeatureGridColumns,
  FeatureGridItem,
  FeatureGridProps,
  FeatureGridResponsiveValue,
  FeatureGridSlotProps
} from '../../types';

const DEFAULT_COLUMNS: Required<Exclude<FeatureGridColumns, number>> = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 3,
  xl: 4,
};

function getGridTemplateColumns(
  columns: FeatureGridColumns,
): string | Record<string, string> {
  if (typeof columns === 'number') {
    return `repeat(${Math.max(1, Math.floor(columns))}, minmax(0, 1fr))`;
  }

  return {
    xs: `repeat(${Math.max(1, Math.floor(columns.xs ?? DEFAULT_COLUMNS.xs))}, minmax(0, 1fr))`,
    sm: `repeat(${Math.max(1, Math.floor(columns.sm ?? DEFAULT_COLUMNS.sm))}, minmax(0, 1fr))`,
    md: `repeat(${Math.max(1, Math.floor(columns.md ?? DEFAULT_COLUMNS.md))}, minmax(0, 1fr))`,
    lg: `repeat(${Math.max(1, Math.floor(columns.lg ?? DEFAULT_COLUMNS.lg))}, minmax(0, 1fr))`,
    xl: `repeat(${Math.max(1, Math.floor(columns.xl ?? DEFAULT_COLUMNS.xl))}, minmax(0, 1fr))`,
  };
}

function getTextAlign(align: FeatureGridAlign): 'left' | 'center' | 'right' {
  return align;
}

function getAlignItems(
  align: FeatureGridAlign,
): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'left') {
    return 'flex-start';
  }

  if (align === 'right') {
    return 'flex-end';
  }

  return 'center';
}

function getJustifyContent(
  align: FeatureGridAlign,
): 'flex-start' | 'center' | 'flex-end' {
  return getAlignItems(align);
}

function getItemKey(item: FeatureGridItem, index: number): string {
  if (item.id) {
    return item.id;
  }

  if (typeof item.title === 'string') {
    return item.title;
  }

  return `feature-grid-item-${index}`;
}

export function FeatureGrid({
  component = 'section',

  eyebrow,
  title,
  description,
  actions,

  items = [],

  columns = DEFAULT_COLUMNS,
  gap = { xs: 2, md: 2.5 },
  minCardWidth,
  align = 'center',
  maxWidth = 1320,
  centered = true,

  cardFullHeight = true,
  compactCards = false,

  emptyState = 'No features are available yet.',

  slotProps,
  sx,
  ...boxProps
}: FeatureGridProps): React.ReactElement {
  const titleId = React.useId();
  const safeItems = React.useMemo(() => [...items], [items]);

  const hasHeader = Boolean(eyebrow || title || description || actions);
  const textAlign = getTextAlign(align);
  const alignItems = getAlignItems(align);
  const justifyContent = getJustifyContent(align);

  const gridTemplateColumns = minCardWidth
    ? {
        xs: '1fr',
        sm: `repeat(auto-fit, minmax(min(100%, ${String(
          minCardWidth,
        )}), 1fr))`,
      }
    : getGridTemplateColumns(columns);

  return (
    <Box
      component={component}
      aria-labelledby={title ? titleId : undefined}
      {...boxProps}
      {...slotProps?.root}
      sx={mergeSx(
        {
          width: '100%',
          maxWidth,
          mx: centered ? 'auto' : undefined,
          display: 'grid',
          gap: { xs: 3, md: 4 },
        },
        sx,
        slotProps?.root?.sx,
      )}
    >
      {hasHeader ? (
        <Stack
          spacing={1.25}
          {...slotProps?.header}
          sx={mergeSx(
            {
              maxWidth: 980,
              mx: align === 'center' ? 'auto' : undefined,
              textAlign,
              alignItems,
            },
            slotProps?.header?.sx,
          )}
        >
          {eyebrow ? (
            <Typography
              component="p"
              variant="overline"
              sx={{
                color: 'secondary.main',
                fontWeight: 900,
                letterSpacing: '0.14em',
                lineHeight: 1.4,
              }}
            >
              {eyebrow}
            </Typography>
          ) : null}

          {title ? (
            <Typography
              id={titleId}
              component="h2"
              variant="h3"
              sx={{
                color: 'text.primary',
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: '-0.045em',
              }}
            >
              {title}
            </Typography>
          ) : null}

          {description ? (
            <Typography
              component="p"
              color="text.secondary"
              sx={{
                maxWidth: 820,
                fontSize: { xs: '1rem', md: '1.075rem' },
                lineHeight: 1.8,
              }}
            >
              {description}
            </Typography>
          ) : null}

          {actions ? (
            <Box
              {...slotProps?.actions}
              sx={mergeSx(
                {
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1.25,
                  justifyContent,
                  pt: 0.75,
                },
                slotProps?.actions?.sx,
              )}
            >
              {actions}
            </Box>
          ) : null}
        </Stack>
      ) : null}

      {safeItems.length > 0 ? (
        <Box
          {...slotProps?.grid}
          sx={mergeSx(
            {
              display: 'grid',
              gridTemplateColumns,
              gap,
              alignItems: 'stretch',
            },
            slotProps?.grid?.sx,
          )}
        >
          {safeItems.map((item, index) => {
            const {
              id,
              featured,
              gridColumn,
              gridRow,
              itemSx,
              ...cardProps
            } = item;

            return (
              <Box
                key={getItemKey(item, index)}
                {...slotProps?.item}
                sx={mergeSx(
                  {
                    minWidth: 0,
                    height: cardFullHeight ? '100%' : undefined,
                    gridColumn:
                      gridColumn ?? (featured ? { md: 'span 2' } : undefined),
                    gridRow,
                  },
                  slotProps?.item?.sx,
                  itemSx,
                )}
              >
                <FeatureCard
                  compact={compactCards}
                  fullHeight={cardFullHeight}
                  {...cardProps}
                />
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box
          {...slotProps?.empty}
          sx={mergeSx(
            {
              width: '100%',
              minHeight: 180,
              display: 'grid',
              placeItems: 'center',
              p: 3,
              border: 1,
              borderColor: 'divider',
              borderRadius: 3,
              textAlign: 'center',
            },
            slotProps?.empty?.sx,
          )}
        >
          {typeof emptyState === 'string' ? (
            <Typography color="text.secondary">{emptyState}</Typography>
          ) : (
            emptyState
          )}
        </Box>
      )}
    </Box>
  );
}

export default FeatureGrid;
