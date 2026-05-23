// apps/frontend/src/app/technology/layout.tsx

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://helixaibot.com'),

  title: 'Helix AI Technology | AI Architecture, Automation, and Integrations',

  description:
    'Explore the technology behind Helix AI, including adaptive AI architecture, automation systems, integrations, analytics, memory, infrastructure, and developer-focused AI tools.',

  keywords: [
    'Helix AI technology',
    'AI architecture',
    'adaptive AI',
    'AI automation',
    'AI integrations',
    'AI assistant platform',
    'developer AI tools',
    'enterprise AI platform',
    'machine learning infrastructure',
    'AI analytics',
    'AI memory',
    'workflow automation',
    'cloud AI platform',
    'local AI assistant',
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
    canonical: '/technology',
  },

  openGraph: {
    title: 'Helix AI Technology | AI Architecture and Integrations',
    description:
      'Discover the technology behind Helix AI: adaptive AI architecture, automation, integrations, analytics, memory, and scalable infrastructure for developers and organizations.',
    url: '/technology',
    siteName: 'Helix AI',
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Helix AI Technology | AI Architecture and Integrations',
    description:
      'Explore Helix AI technology for adaptive AI, automation, integrations, analytics, memory, and scalable developer infrastructure.',
    site: '@Sinless777',
    creator: '@Sinless777',
  },
};

export default function TechnologyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}