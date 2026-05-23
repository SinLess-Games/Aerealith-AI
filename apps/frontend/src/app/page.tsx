// apps/frontend/src/app/page.tsx

'use client';

import { Box, Stack } from '@mui/material';
import { Footer, Header, HeroSection } from '@helix-ai/ui';

import { footerProps } from '@helix-ai/content/en/footer';
import { headerProps } from '@helix-ai/content/en/header';
import { HERO_DATA, SECTIONS_DATA } from '@helix-ai/content/en/home/content';

export default function IndexPage() {
  return (
    <div className="flex min-h-screen flex-col text-white">
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