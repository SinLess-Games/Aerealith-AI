// apps/frontend/src/app/page.tsx

'use client';

import { Footer, Header, HeroSection } from '@aerealith-ai/ui';
import { Box, Stack } from '@mui/material';
import * as React from 'react';

import { HERO_DATA, SECTIONS_DATA, footerProps, headerProps } from '@aerealith-ai/content';

import { useFeatureFlags } from '../components/feature-flags-provider';

export default function IndexPage() {
  const featureFlags = useFeatureFlags();
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div
        className="flex min-h-screen flex-col text-white"
        data-darkreader-ignore
        suppressHydrationWarning
      />
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col text-white"
      data-darkreader-ignore
      suppressHydrationWarning
    >
      {featureFlags.pricing ? (
        <div
          className="border-b border-white/10 bg-black/20 px-4 py-2 text-center text-xs uppercase tracking-[0.24em] text-cyan-200 md:px-8"
          data-darkreader-ignore
          suppressHydrationWarning
        >
          Pricing and billing experiences are enabled.
        </div>
      ) : null}

      <Box data-darkreader-ignore suppressHydrationWarning>
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />
      </Box>

      <main
        id="main-content"
        className="flex-grow px-4 pb-16 pt-6 md:px-8 md:pb-24"
        data-darkreader-ignore
        suppressHydrationWarning
      >
        <Box
          id="hero"
          component="section"
          aria-label="Hero"
          data-darkreader-ignore
          suppressHydrationWarning
          sx={{
            mx: 'auto',
            width: '100%',
            maxWidth: 1900,
          }}
        >
          <HeroSection
            title={HERO_DATA.title}
            subtitle={HERO_DATA.subtitle}
            imageUrl={HERO_DATA.imageUrl}
            imageAlt={HERO_DATA.imageAlt}
          />
        </Box>

        <Stack
          component="section"
          aria-label={SECTIONS_DATA.pageTitle}
          spacing={{ xs: 5, md: 7 }}
          data-darkreader-ignore
          suppressHydrationWarning
          sx={{
            mx: 'auto',
            mt: { xs: 5, md: 7 },
            width: '100%',
            maxWidth: 1900,
          }}
        >
          {SECTIONS_DATA.sections}
        </Stack>
      </main>

      <Box data-darkreader-ignore suppressHydrationWarning>
        <Footer {...footerProps} />
      </Box>
    </div>
  );
}
