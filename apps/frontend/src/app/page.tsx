'use client';

import { Header, HeroSection } from '@helix-ai/ui';

import { headerProps } from '../content/header';

const HERO_DATA = {
  title: 'Helix AI — Your Digital Life, Intelligently Connected',
  subtitle:
    'Helix AI is a secure virtual assistant designed to bring your digital life into one intelligent command center. It goes beyond basic voice commands by connecting your apps, organizing your data, automating repetitive tasks, monitoring important systems, and turning scattered information into clear, actionable insight. Built for work, home, creators, developers, and infrastructure operators, Helix helps you ask better questions, manage complex workflows, track what matters, and stay in control across the tools and platforms you rely on every day.',
  imageUrl: '/images/hero.png',
  imageAlt: 'Helix AI futuristic hero artwork',
} as const;

export default function IndexPage() {
  return (
    <div className="flex min-h-screen flex-col text-white">
      <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

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