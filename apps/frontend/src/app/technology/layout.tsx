// apps/frontend/src/app/technology/layout.tsx

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Helix AI Technologies | Advanced AI Solutions & Architecture',
  description:
    'Discover Helix AI Technologies: innovative AI platforms, machine-learning infrastructure, and integrations that empower developers and enterprises to build intelligent applications at scale.',
  keywords: [
    'Helix AI Technologies',
    'AI solutions',
    'AI architecture',
    'machine learning',
    'deep learning',
    'NLP',
    'AI integrations',
    'enterprise AI',
    'developer AI tools',
  ],
  authors: [{ name: 'SinLess Games LLC', url: 'https://sinlessgamesllc.com' }],
  robots: { index: true, follow: true },
  alternates: {
    canonical: 'https://helixaibot.com/technology',
  },
  openGraph: {
    title: 'Helix AI Technologies | Advanced AI Solutions & Architecture',
    description:
      'Explore Helix AI Technologies: cutting-edge AI platforms, ML infrastructure, and integrations designed for seamless enterprise and developer adoption.',
    url: 'https://helixaibot.com/technology',
    siteName: 'Helix AI',
    images: [
      {
        url: 'https://cdn.sinlessgamesllc.com/Helix-AI/images/Technology_Card.png',
        width: 1200,
        height: 630,
        alt: 'Helix AI Technologies overview',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helix AI Technologies | Advanced AI Solutions & Architecture',
    description:
      'Discover Helix AI Technologies: innovative AI platforms and integrations for developers and enterprises.',
    images: ['https://cdn.sinlessgamesllc.com/Helix-AI/images/Technology_Card.png'],
    site: '@Sinless777',
    creator: '@Sinless777',
  },
};

export default function TechnologyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}