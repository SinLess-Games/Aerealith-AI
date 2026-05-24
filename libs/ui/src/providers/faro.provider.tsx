'use client';

import { type ReactNode, useEffect } from 'react';

import { initFaro, type FaroClientConfig } from '../utils/faro';

export type FaroProviderProps = {
  children: ReactNode;

  /**
   * Allows Faro to be explicitly disabled from the app layer.
   *
   * Defaults to true and still respects @aerealith-ai/config.
   */
  enabled?: boolean;

  /**
   * Optional runtime overrides for Faro config.
   *
   * Values here override @aerealith-ai/config and NEXT_PUBLIC_* env values.
   */
  config?: Partial<FaroClientConfig>;
};

const DEFAULT_FARO_CONFIG: Partial<FaroClientConfig> = {};

export function FaroProvider({
  children,
  enabled = true,
  config = DEFAULT_FARO_CONFIG,
}: FaroProviderProps) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    void initFaro({
      ...config,
      enabled: config.enabled ?? enabled,
    });
  }, [enabled, config]);

  return children;
}

export default FaroProvider;
