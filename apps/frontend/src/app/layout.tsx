// apps/frontend/src/app/layout.tsx

import * as React from 'react';
import type { Metadata, Viewport } from 'next';
import { Background, HelixProviders } from '@helix-ai/ui';

export const metadata: Metadata = {
  metadataBase: new URL('https://helixaibot.com'),
  title: { default: 'Helix AI', template: '%s | Helix AI' },
  description:
    'Helix AI is your adaptive digital companion — connect, automate, and analyze across your ecosystem.',
  keywords: [
    'Helix AI',
    'AI assistant',
    'automation',
    'productivity',
    'Next.js',
    'Cloudflare',
    'SinLess Games',
  ],
  applicationName: 'Helix AI',
  authors: [{ name: 'SinLess Games LLC', url: 'https://sinlessgames.com' }],
  creator: 'SinLess Games LLC',
  publisher: 'SinLess Games LLC',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://helixaibot.com' },
  openGraph: {
    title: 'Helix AI',
    description:
      'Your adaptive digital companion — connect, automate, and analyze across your ecosystem.',
    url: 'https://helixaibot.com',
    siteName: 'Helix AI',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@Sinless777',
    creator: '@Sinless777',
    title: 'Helix AI',
    description:
      'Your adaptive digital companion — connect, automate, and analyze across your ecosystem.',  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
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
        <Background
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
        </Background>
      </body>
    </html>
  );
}