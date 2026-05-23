import type { HeaderProps, Page } from '../../types';

export const headerPages = [
  {
    name: 'Home',
    url: '/',
  },
  {
    name: 'About',
    url: '/About',
  },
  // {
  //   name: 'Pricing',
  //   url: '/Pricing',
  // },
  {
    name: 'Tech Stack',
    url: '/Technology',
  },
  {
    name: 'Contact',
    url: '/Contact',
  },
] as const satisfies readonly Page[];

export const headerProps = {
  logo: '/images/headerLogo.png',
  title: 'Helix AI',
  version: '1.0.0',
  pages: headerPages,
  style: {
    padding: '1rem 2rem',
    background:
      'linear-gradient(to right, rgba(246, 6, 111, 0.8), rgba(2, 35, 113, 0.8))',
  },
} as const satisfies HeaderProps;

export default headerProps;