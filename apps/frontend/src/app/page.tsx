'use client';

import { DevelopmentBanner, Header, HeroSection } from '@helix-ai/ui';

import { headerProps } from '../content/header';

const HERO_DATA = {
  title: 'Meet Helix AI — Your Intelligent Companion for a Smarter Digital Life',
  subtitle:
    'Seamlessly connect, automate, and analyze with an AI assistant built to simplify tasks, enhance productivity, and empower your decisions across every platform you use.',
  imageUrl: '/images/hero.png',
  imageAlt: 'Helix AI futuristic hero artwork',
} as const;

export default function IndexPage() {
  return (
    <div className="flex min-h-screen flex-col text-white">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-white/10 px-3 py-2 text-sm backdrop-blur hover:bg-white/20 focus:not-sr-only"
      >
        Skip to content
      </a>

      <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

      <DevelopmentBanner
        fixed={false}
        sx={{
          mt: { xs: 8, md: 9 },
          mx: { xs: 2, md: 4 },
          borderRadius: 2,
        }}
      />

      <main
        id="main-content"
        className="flex-grow px-4 pb-16 pt-6 md:px-8 md:pb-24"
      >
        <HeroSection
          title={HERO_DATA.title}
          subtitle={HERO_DATA.subtitle}
          imageUrl={HERO_DATA.imageUrl}
          imageAlt={HERO_DATA.imageAlt}
        />
      </main>
    </div>
  );
}