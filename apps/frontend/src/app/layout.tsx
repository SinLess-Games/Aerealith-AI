// apps/frontend/src/app/layout.tsx

import * as React from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { BackgroundImage, HelixProviders } from '@aerealith-ai/ui';
import { Image_Paths } from '@aerealith-ai/content';

import { FeatureFlagsProvider } from '../components/feature-flags-provider';
import {
  createDefaultFrontendFeatureFlags,
  parseFrontendFeatureFlags,
  FRONTEND_FEATURE_FLAGS_HEADER,
} from '../lib/feature-flags';

import 'next-cloudinary/dist/cld-video-player.css';
import './globals.scss';

const SITE_URL = 'https://aerealith.ai';

const SITE_NAME = 'Aerealith AI';

const OG_IMAGE = `${Image_Paths.root}/og-image.png`;

const BACKGROUND_DARK_IMAGE = `${Image_Paths.backgrounds}/background-dark.png`;
const BACKGROUND_LIGHT_IMAGE = `${Image_Paths.backgrounds}/background-light.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default:
      'Aerealith AI | Adaptive AI Assistant for Automation, Memory, and Analytics',
    template: `%s | ${SITE_NAME}`,
  },

  description:
    'Aerealith AI is an adaptive AI assistant platform for automation, memory, analytics, workflows, and connected digital ecosystems.',

  keywords: [
    'Aerealith AI',
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
    'AI command center',
    'connected apps',
    'permissioned memory',
    'transparent automation',
    'SinLess Games LLC',
  ],

  applicationName: SITE_NAME,

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
    title: 'Aerealith AI | Adaptive AI Assistant Platform',
    description:
      'Connect, automate, analyze, and manage your digital ecosystem with an adaptive AI assistant built for individuals, creators, developers, and organizations.',
    url: '/',
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Aerealith AI adaptive AI assistant platform',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Aerealith AI | Adaptive AI Assistant Platform',
    description:
      'An adaptive AI assistant platform for automation, memory, analytics, workflows, and connected digital ecosystems.',
    images: [OG_IMAGE],
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
        url: '/icons/icon-180.png',
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

export default async function RootLayout({ children }: RootLayoutProps) {
  const requestHeaders = await headers();
  const featureFlags = {
    ...createDefaultFrontendFeatureFlags(),
    ...parseFrontendFeatureFlags(
      requestHeaders.get(FRONTEND_FEATURE_FLAGS_HEADER),
    ),
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <BackgroundImage
          imageUrl={BACKGROUND_DARK_IMAGE}
          lightImageUrl={BACKGROUND_LIGHT_IMAGE}
          darkImageUrl={BACKGROUND_DARK_IMAGE}
          altText=""
          overlayOpacity={0.18}
          lightOverlayOpacity={0.08}
          darkOverlayOpacity={0.28}
          priority
        >
          <HelixProviders defaultMode="system">
            <FeatureFlagsProvider initialFlags={featureFlags}>
              {children}
            </FeatureFlagsProvider>
          </HelixProviders>
        </BackgroundImage>
      </body>
    </html>
  );
}