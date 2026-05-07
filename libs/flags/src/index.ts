export type FeatureFlagValue = boolean | string | number | null;

export type FeatureFlagContext = {
  environment?: string;
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  plan?: string;
  role?: string;
};

export type FeatureFlagSnapshot = {
  version: number;
  environment: string;
  updatedAt?: string;
  flags: Record<string, FeatureFlagValue>;
};

export function getFlagValue<T extends FeatureFlagValue>(
  snapshot: FeatureFlagSnapshot | null | undefined,
  key: string,
  fallback: T,
): T {
  const value = snapshot?.flags?.[key];

  return value === undefined ? fallback : (value as T);
}

export function isFlagEnabled(
  snapshot: FeatureFlagSnapshot | null | undefined,
  key: string,
  fallback = false,
): boolean {
  return getFlagValue(snapshot, key, fallback) === true;
}
