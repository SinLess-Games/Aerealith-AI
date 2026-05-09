// libs/shared/site-content/src/lib/header/index.ts

import type { CSSProperties } from 'react';

import { pages, type Page } from '../home/index';

export interface HeaderLink {
  name: string;
  url: string;
}

export interface HeaderProps {
  logo: string;
  title: string;
  version: string;
  pages: Page[];
  style?: CSSProperties;
}

export const headerProps: HeaderProps = {
  logo: '/images/headerLogo.png',
  title: 'Helix AI',
  version: '1.0.0',
  pages,
  style: {
    padding: '1rem 2rem',
    background: 'linear-gradient(to right, rgba(246, 6, 111, 0.8), rgba(2, 35, 113, 0.8))',
  },
} as const;
