// apps/frontend/src/app/About/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://helixaibot.com'),

  title: 'About Helix AI | Adaptive AI Companion Platform',

  description:
    'Learn about Helix AI, an adaptive AI companion platform built to connect tools, automate workflows, support memory, and deliver real-time analytics for individuals, creators, developers, and organizations.',

  keywords: [
    'Helix AI',
    'About Helix AI',
    'adaptive AI companion',
    'AI assistant platform',
    'intelligent digital companion',
    'AI automation',
    'workflow automation',
    'AI memory',
    'real-time analytics',
    'AI productivity',
    'connected digital ecosystem',
    'personal AI assistant',
    'business AI assistant',
    'developer AI tools',
    'SinLess Games LLC',
  ],

  authors: [
    {
      name: 'SinLess Games LLC',
      url: 'https://sinlessgames.com',
    },
  ],

  creator: 'SinLess Games LLC',
  publisher: 'SinLess Games LLC',
  category: 'technology',

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  alternates: {
    canonical: '/About',
  },

  openGraph: {
    title: 'About Helix AI | Adaptive AI Companion Platform',
    description:
      'Discover the mission behind Helix AI: an adaptive AI companion platform designed to unify tools, automate workflows, support memory, and provide real-time insight across your digital ecosystem.',
    url: '/About',
    siteName: 'Helix AI',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'About Helix AI adaptive AI companion platform',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'About Helix AI | Adaptive AI Companion Platform',
    description:
      'Learn about Helix AI, an adaptive AI companion platform for automation, memory, analytics, and connected digital ecosystems.',
    images: ['/og-image.png'],
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