// apps/frontend/src/app/layout.tsx

import * as React from 'react';
import type { Metadata, Viewport } from 'next';
import { BackgroundImage, HelixProviders } from '@helix-ai/ui';
import 'next-cloudinary/dist/cld-video-player.css';
import './globals.scss';

export const metadata: Metadata = {
  metadataBase: new URL('https://helixaibot.com'),

  title: {
    default: 'Helix AI | Adaptive AI Assistant for Automation, Memory, and Analytics',
    template: '%s | Helix AI',
  },

  description:
    'Helix AI is an adaptive AI assistant platform for automation, memory, analytics, workflows, and connected digital ecosystems.',

  keywords: [
    'Helix AI',
    'AI assistant',
    'adaptive AI assistant',
    'AI automation',
    'AI companion',
    'workflow automation',
    'personal AI assistant',
    'business AI assistant',
    'AI analytics',
    'AI productivity',
    'AI memory',
    'digital assistant',
    'SinLess Games LLC',
  ],

  applicationName: 'Helix AI',

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
    canonical: '/',
  },

  openGraph: {
    title: 'Helix AI | Adaptive AI Assistant Platform',
    description:
      'Connect, automate, analyze, and manage your digital ecosystem with an adaptive AI assistant built for individuals, creators, developers, and organizations.',
    url: '/',
    siteName: 'Helix AI',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Helix AI adaptive AI assistant platform',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Helix AI | Adaptive AI Assistant Platform',
    description:
      'An adaptive AI assistant platform for automation, memory, analytics, workflows, and connected digital ecosystems.',
    images: ['/images/og-image.png'],
  },

  icons: {
    icon: [
      { url: '/favicon.ico' },
      {
        url: '/icons/icon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },

  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <BackgroundImage
          imageUrl="/images/background-dark.png"
          lightImageUrl="/images/background-light.png"
          darkImageUrl="/images/background-dark.png"
          altText=""
          overlayOpacity={0.18}
          lightOverlayOpacity={0.08}
          darkOverlayOpacity={0.28}
          priority
        >
          <HelixProviders defaultMode="system">{children}</HelixProviders>
        </BackgroundImage>
      </body>
    </html>
  );
}