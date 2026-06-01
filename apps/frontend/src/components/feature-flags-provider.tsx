'use client';

import * as React from 'react';

import type {
  FrontendFeatureFlags,
  FrontendSafeFlagKey,
} from '../lib/feature-flags';

type FeatureFlagsContextValue = {
  flags: FrontendFeatureFlags;
};

const FeatureFlagsContext = React.createContext<FeatureFlagsContextValue>({
  flags: {
    registration: true,
    pricing: false,
    dashboard: false,
    onboarding: false,
    observability: false,
    profile: true,
    'profile-public': true,
    'profile-private': true,
    'profile-app-connections': true,
    'profile-integrations': true,
    'profile-files': true,
    'profile-reports': true,
    'profile-achievements': true,
  },
});

export type FeatureFlagsProviderProps = {
  children: React.ReactNode;
  initialFlags: FrontendFeatureFlags;
};

export function FeatureFlagsProvider({
  children,
  initialFlags,
}: FeatureFlagsProviderProps) {
  const value = React.useMemo(() => ({ flags: initialFlags }), [initialFlags]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FrontendFeatureFlags {
  return React.useContext(FeatureFlagsContext).flags;
}

export function useFeatureFlag(key: FrontendSafeFlagKey): boolean {
  return useFeatureFlags()[key];
}
