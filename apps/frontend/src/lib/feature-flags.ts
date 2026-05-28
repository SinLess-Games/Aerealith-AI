import { headers } from 'next/headers';

import type { FlagBootstrapPayload, FlagKey } from '@aerealith-ai/flags';

export const FRONTEND_FEATURE_FLAGS_HEADER = 'x-aerealith-feature-flags';

export const FRONTEND_SAFE_FLAG_KEYS = [
  'pricing',
  'dashboard',
  'onboarding',
  'observability',
] as const satisfies readonly FlagKey[];

export type FrontendSafeFlagKey = (typeof FRONTEND_SAFE_FLAG_KEYS)[number];

export type FrontendFeatureFlags = Record<FrontendSafeFlagKey, boolean>;

export const createDefaultFrontendFeatureFlags = (): FrontendFeatureFlags => ({
  pricing: false,
  dashboard: false,
  onboarding: false,
  observability: false,
});

export const parseFrontendFeatureFlags = (
  value: string | null | undefined,
): Partial<FrontendFeatureFlags> => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as FlagBootstrapPayload & Record<string, unknown>;
    const flags = (parsed.values ?? parsed) as Record<string, unknown>;

    return Object.fromEntries(
      FRONTEND_SAFE_FLAG_KEYS.flatMap((key) => {
        const flagValue = flags[key];

        return typeof flagValue === 'boolean' ? [[key, flagValue] as const] : [];
      }),
    ) as Partial<FrontendFeatureFlags>;
  } catch {
    return {};
  }
};

export async function getFrontendFeatureFlags(): Promise<FrontendFeatureFlags> {
  const requestHeaders = await headers();

  return {
    ...createDefaultFrontendFeatureFlags(),
    ...parseFrontendFeatureFlags(
      requestHeaders.get(FRONTEND_FEATURE_FLAGS_HEADER),
    ),
  };
}
