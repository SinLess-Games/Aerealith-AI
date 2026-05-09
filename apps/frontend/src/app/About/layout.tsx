// apps/frontend/src/app/About/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'About Helix AI | Helix AI — Your Intelligent Digital Companion',
  description:
    'Learn about Helix AI: the intelligent digital companion built to unify your tools, simplify workflows, and empower decisions with real-time insights and adaptive AI. Discover our mission, story, and the team behind the innovation.',
  keywords: [
    'Helix AI',
    'About Helix AI',
    'AI assistant',
    'intelligent digital companion',
    'machine learning',
    'deep neural networks',
    'real-time insights',
    'adaptive AI',
    'productivity AI',
    'Helix AI team',
  ],
  authors: [
    {
      name: 'SinLess Games LLC',
      url: 'https://sinlessgames.com',
    },
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://helixaibot.com/About',
  },
  openGraph: {
    title: 'About Helix AI | Helix AI — Your Intelligent Digital Companion',
    description:
      'Learn about Helix AI: the intelligent digital companion built to unify your tools, simplify workflows, and empower decisions with real-time insights and adaptive AI. Discover our mission, story, and the team behind the innovation.',
    url: 'https://helixaibot.com/About',
    siteName: 'Helix AI',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Helix AI | Helix AI — Your Intelligent Digital Companion',
    description:
      'Learn about Helix AI: the intelligent digital companion built to unify your tools, simplify workflows, and empower decisions with real-time insights and adaptive AI.',
  },
};

export default function AboutLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      {children}
    </main>
  );
}