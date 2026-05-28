// apps/frontend/src/app/page.tsx

'use client';

import { Box, Stack } from '@mui/material';
import { Footer, Header, HeroSection } from '@aerealith-ai/ui';

import { footerProps } from '@aerealith-ai/content/en/footer';
import { headerProps } from '@aerealith-ai/content/en/header';
import { HERO_DATA, SECTIONS_DATA } from '@aerealith-ai/content/en/home/content';

import { useFeatureFlags } from '../components/feature-flags-provider';

export default function IndexPage() {
  const featureFlags = useFeatureFlags();

  return (
    <div className="flex min-h-screen flex-col text-white">
      {featureFlags.pricing ? (
        <div className="border-b border-white/10 bg-black/20 px-4 py-2 text-center text-xs uppercase tracking-[0.24em] text-cyan-200 md:px-8">
          Pricing and billing experiences are enabled.
        </div>
      ) : null}

      <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

      <main
        id="main-content"
        className="flex-grow px-4 pb-16 pt-6 md:px-8 md:pb-24"
      >
        <Box
          id="hero"
          component="section"
          aria-label="Hero"
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

      <Footer {...footerProps} />
    </div>
  );
}