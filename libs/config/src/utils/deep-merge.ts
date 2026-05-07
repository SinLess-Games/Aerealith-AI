export type PlainObject = Record<string, unknown>;

export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Date
    ? T
    : T extends RegExp
      ? T
      : T extends readonly (infer TItem)[]
        ? readonly DeepPartial<TItem>[]
        : T extends object
          ? {
              [TKey in keyof T]?: DeepPartial<T[TKey]>;
            }
          : T;

export type ArrayMergeStrategy = 'replace' | 'concat' | 'merge-by-index';

export type UndefinedMergeStrategy = 'ignore' | 'overwrite';

export type DeepMergeOptions = {
  /**
   * How arrays should be merged.
   *
   * replace:
   *   source array replaces target array
   *
   * concat:
   *   target array + source array
   *
   * merge-by-index:
   *   object values at matching indexes are deep-merged
   */
  arrayStrategy?: ArrayMergeStrategy;

  /**
   * How undefined source values should be handled.
   *
   * ignore:
   *   undefined source values do not overwrite existing values
   *
   * overwrite:
   *   undefined source values overwrite existing values
   */
  undefinedStrategy?: UndefinedMergeStrategy;

  /**
   * Protect against extremely deep or circular structures.
   */
  maxDepth?: number;
};

type DeepMergeContext = {
  options: Required<DeepMergeOptions>;
  depth: number;
  seen: WeakMap<object, unknown>;
};

const DEFAULT_MAX_DEPTH = 100;

const defaultDeepMergeOptions = {
  arrayStrategy: 'replace',
  undefinedStrategy: 'ignore',
  maxDepth: DEFAULT_MAX_DEPTH,
} satisfies Required<DeepMergeOptions>;

export function deepMerge<TTarget, TSource>(
  target: TTarget,
  source: TSource,
  options: DeepMergeOptions = {},
): TTarget & TSource {
  const context = createContext(options);

  return deepMergeUnknown(target, source, context) as TTarget & TSource;
}

export function deepMergeAll<T>(
  values: readonly DeepPartial<T>[],
  options: DeepMergeOptions = {},
): T {
  return values.reduce<unknown>((merged, value) => {
    const context = createContext(options);

    return deepMergeUnknown(merged, value, context);
  }, {}) as T;
}

export function deepClone<T>(value: T): T {
  return cloneUnknown(value, new WeakMap<object, unknown>()) as T;
}

export function mergeDefined<TTarget, TSource>(
  target: TTarget,
  source: TSource,
  options: Omit<DeepMergeOptions, 'undefinedStrategy'> = {},
): TTarget & TSource {
  return deepMerge(target, source, {
    ...options,
    undefinedStrategy: 'ignore',
  });
}

export function mergeOverwrite<TTarget, TSource>(
  target: TTarget,
  source: TSource,
  options: Omit<DeepMergeOptions, 'undefinedStrategy'> = {},
): TTarget & TSource {
  return deepMerge(target, source, {
    ...options,
    undefinedStrategy: 'overwrite',
  });
}

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

export function isMergeableValue(value: unknown): value is PlainObject {
  return isPlainObject(value);
}

export function compactUndefined<T extends PlainObject>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (entryValue === undefined) {
        return [];
      }

      if (isPlainObject(entryValue)) {
        return [[key, compactUndefined(entryValue)]];
      }

      if (Array.isArray(entryValue)) {
        return [
          [
            key,
            entryValue.map((item: unknown) => {
              if (isPlainObject(item)) {
                return compactUndefined(item);
              }

              return item;
            }),
          ],
        ];
      }

      return [[key, entryValue]];
    }),
  ) as T;
}

export function setDeepValue<T extends PlainObject>(
  target: T,
  path: string | readonly string[],
  value: unknown,
): T {
  const segments = normalizePath(path);

  if (segments.length === 0) {
    return target;
  }

  const leafSegment = segments[segments.length - 1];

  if (leafSegment === undefined) {
    return target;
  }

  let cursor: PlainObject = target;

  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];

    if (!isPlainObject(existing)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as PlainObject;
  }

  cursor[leafSegment] = value;

  return target;
}

export function getDeepValue<T = unknown>(
  target: unknown,
  path: string | readonly string[],
): T | undefined {
  const segments = normalizePath(path);

  if (segments.length === 0) {
    return target as T;
  }

  let cursor: unknown = target;

  for (const segment of segments) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];

    if (cursor === undefined) {
      return undefined;
    }
  }

  return cursor as T;
}

export function hasDeepValue(
  target: unknown,
  path: string | readonly string[],
): boolean {
  return getDeepValue(target, path) !== undefined;
}

export function deleteDeepValue<T extends PlainObject>(
  target: T,
  path: string | readonly string[],
): T {
  const segments = normalizePath(path);

  if (segments.length === 0) {
    return target;
  }

  const leafSegment = segments[segments.length - 1];

  if (leafSegment === undefined) {
    return target;
  }

  const parentPath = segments.slice(0, -1);
  const parent = getDeepValue<PlainObject | unknown[]>(target, parentPath);

  if (isPlainObject(parent) || Array.isArray(parent)) {
    delete (parent as Record<string, unknown>)[leafSegment];
  }

  return target;
}

function createContext(options: DeepMergeOptions): DeepMergeContext {
  return {
    options: {
      ...defaultDeepMergeOptions,
      ...options,
    },
    depth: 0,
    seen: new WeakMap<object, unknown>(),
  };
}

function deepMergeUnknown(
  target: unknown,
  source: unknown,
  context: DeepMergeContext,
): unknown {
  if (context.depth > context.options.maxDepth) {
    return cloneUnknown(source, context.seen);
  }

  if (
    source === undefined &&
    context.options.undefinedStrategy === 'ignore'
  ) {
    return cloneUnknown(target, context.seen);
  }

  if (Array.isArray(target) && Array.isArray(source)) {
    return mergeArrays(target, source, context);
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    return mergeObjects(target, source, context);
  }

  return cloneUnknown(source, context.seen);
}

function mergeObjects(
  target: PlainObject,
  source: PlainObject,
  context: DeepMergeContext,
): PlainObject {
  const clonedTarget = cloneUnknown(target, context.seen);

  if (!isPlainObject(clonedTarget)) {
    return cloneUnknown(source, context.seen) as PlainObject;
  }

  const output: PlainObject = clonedTarget;

  for (const [key, sourceValue] of Object.entries(source)) {
    if (
      sourceValue === undefined &&
      context.options.undefinedStrategy === 'ignore'
    ) {
      continue;
    }

    const targetValue = output[key];

    output[key] = deepMergeUnknown(targetValue, sourceValue, {
      ...context,
      depth: context.depth + 1,
    });
  }

  return output;
}

function mergeArrays(
  target: unknown[],
  source: unknown[],
  context: DeepMergeContext,
): unknown[] {
  if (context.options.arrayStrategy === 'concat') {
    return [
      ...target.map((item: unknown) => cloneUnknown(item, context.seen)),
      ...source.map((item: unknown) => cloneUnknown(item, context.seen)),
    ];
  }

  if (context.options.arrayStrategy === 'merge-by-index') {
    const maxLength = Math.max(target.length, source.length);
    const output: unknown[] = [];

    for (let index = 0; index < maxLength; index += 1) {
      if (!(index in source)) {
        output[index] = cloneUnknown(target[index], context.seen);
        continue;
      }

      if (!(index in target)) {
        output[index] = cloneUnknown(source[index], context.seen);
        continue;
      }

      output[index] = deepMergeUnknown(target[index], source[index], {
        ...context,
        depth: context.depth + 1,
      });
    }

    return output;
  }

  return source.map((item: unknown) => cloneUnknown(item, context.seen));
}

function cloneUnknown(
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value);

    if (existing) {
      return existing;
    }

    const output: unknown[] = [];
    seen.set(value, output);

    for (const item of value) {
      output.push(cloneUnknown(item, seen));
    }

    return output;
  }

  if (value instanceof Map) {
    const existing = seen.get(value);

    if (existing) {
      return existing;
    }

    const output = new Map<unknown, unknown>();
    seen.set(value, output);

    for (const [mapKey, mapValue] of value.entries()) {
      output.set(cloneUnknown(mapKey, seen), cloneUnknown(mapValue, seen));
    }

    return output;
  }

  if (value instanceof Set) {
    const existing = seen.get(value);

    if (existing) {
      return existing;
    }

    const output = new Set<unknown>();
    seen.set(value, output);

    for (const item of value.values()) {
      output.add(cloneUnknown(item, seen));
    }

    return output;
  }

  if (isPlainObject(value)) {
    const existing = seen.get(value);

    if (existing) {
      return existing;
    }

    const output: PlainObject = {};
    seen.set(value, output);

    for (const [key, entryValue] of Object.entries(value)) {
      output[key] = cloneUnknown(entryValue, seen);
    }

    return output;
  }

  return value;
}

function normalizePath(path: string | readonly string[]): string[] {
  if (typeof path === 'string') {
    return path
      .split('.')
      .map((segment: string) => segment.trim())
      .filter((segment: string) => segment.length > 0);
  }

  return path
    .map((segment: string) => segment.trim())
    .filter((segment: string) => segment.length > 0);
}