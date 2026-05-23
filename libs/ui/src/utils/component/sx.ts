import { type SxProps, type Theme } from '@mui/material/styles';

export type MergeSxValue<TTheme extends Theme = Theme> =
  | SxProps<TTheme>
  | false
  | null
  | undefined;

/**
 * Safely merges MUI `sx` values.
 *
 * Supports:
 * - objects
 * - functions
 * - arrays
 * - nested arrays
 * - conditional values like `false`, `null`, and `undefined`
 */
export function mergeSx<TTheme extends Theme = Theme>(
  ...values: MergeSxValue<TTheme>[]
): SxProps<TTheme> {
  const merged: SxProps<TTheme>[] = [];

  const append = (value: MergeSxValue<TTheme>): void => {
    if (value === false || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        append(item as MergeSxValue<TTheme>);
      }

      return;
    }

    merged.push(value);
  };

  for (const value of values) {
    append(value);
  }

  return merged as SxProps<TTheme>;
}

export function toSxArray(sx?: SxProps<Theme>): SxProps<Theme>[] {
  if (!sx) {
    return [];
  }

  return Array.isArray(sx) ? sx : [sx];
}