import type { FooterProps } from '../../types';

const currentYear = new Date().getFullYear();

export const footerProps = {
  brandName: 'Helix AI',
  tagline: 'Your digital life, intelligently connected.',
  logoHref: '/',

  version: null,
  versionPrefix: 'v',
  releasesUrl: 'https://github.com/SinLess-Games/Helix/releases',

  variant: 'minimal',
  dense: true,
  maxWidth: '75rem',

  linkGroups: [
    {
      title: 'Product',
      links: [
        {
          label: 'Home',
          href: '/',
        },
        {
          label: 'About',
          href: '/about',
        },
        {
          label: 'Contact',
          href: '/contact',
        },
        {
          label: 'Tech Stack',
          href: '/tech-stack',
        },
      ],
    },
    {
      title: 'Trust',
      links: [
        {
          label: 'Trust & Privacy',
          href: '/trust-privacy-principles',
        },
        {
          label: 'Privacy Policy',
          href: '/policies/privacy',
        },
        {
          label: 'Terms of Use',
          href: '/policies/terms-of-use',
        },
        {
          label: 'Security',
          href: '/policies/security',
        },
      ],
    },
    {
      title: 'Policies',
      links: [
        {
          label: 'Responsible AI',
          href: '/policies/responsible-ai',
        },
        {
          label: 'Cookies',
          href: '/policies/cookie-tracking',
        },
        {
          label: 'Data Policy',
          href: '/policies/data',
        },
        {
          label: 'Support',
          href: '/policies/support',
        },
      ],
    },
    {
      title: 'Company',
      links: [
        {
          label: 'SinLess Games LLC',
          href: 'https://sinlessgames.com',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        {
          label: 'GitHub',
          href: 'https://github.com/SinLess-Games/Helix',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        {
          label: 'Copyright Takedown',
          href: '/policies/copyright-takedown',
        },
        {
          label: 'Developer Policy',
          href: '/policies/developer',
        },
      ],
    },
  ],

  socialLinks: [
    {
      label: 'GitHub',
      href: 'https://github.com/SinLess-Games/Helix',
      target: '_blank',
      rel: 'noopener noreferrer',
      ariaLabel: 'View Helix AI on GitHub',
    },
    {
      label: 'SinLess Games',
      href: 'https://sinlessgames.com',
      target: '_blank',
      rel: 'noopener noreferrer',
      ariaLabel: 'Visit SinLess Games LLC',
    },
  ],

  legalLinks: [
    {
      label: 'Privacy',
      href: '/policies/privacy',
    },
    {
      label: 'Terms',
      href: '/policies/terms-of-use',
    },
    {
      label: 'Security',
      href: '/policies/security',
    },
    {
      label: 'Cookies',
      href: '/policies/cookie-tracking',
    },
  ],

  copyrightHolder: 'SinLess Games LLC',
  copyrightStartYear: 2026,
  copyrightText: `© ${currentYear} SinLess Games LLC. All rights reserved.`,

  sx: {
    mt: 0,
    py: {
      xs: 1.5,
      sm: 2,
      md: 2.25,
    },
    minHeight: 'auto',
    bgcolor: 'rgba(0, 0, 0, 0.85)',
    color: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderTop: 1,
    boxShadow:
      '0 -12px 48px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.06)',

    '& a': {
      color: 'inherit',
      textDecoration: 'none',
    },

    '& a:hover': {
      color: '#f6066f',
    },

    '& h2, & h3, & h4, & h5, & h6': {
      mb: 0.75,
      lineHeight: 1.15,
    },

    '& p': {
      mt: 0,
      mb: 0.75,
      lineHeight: 1.4,
    },

    '& ul': {
      mt: 0.25,
      mb: 0,
    },

    '& li': {
      my: 0.15,
    },

    '& .MuiDivider-root': {
      my: {
        xs: 1.25,
        md: 1.5,
      },
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },

    '& .MuiStack-root': {
      gap: {
        xs: 0.5,
        md: 0.75,
      },
    },
  },

  containerSx: {
    py: 0,
  },

  brandSx: {
    gap: 0.75,

    '& .MuiTypography-root': {
      lineHeight: 1.25,
    },
  },

  linkGroupSx: {
    gap: 0.5,

    '& .MuiTypography-root': {
      lineHeight: 1.2,
    },
  },

  bottomSx: {
    pt: {
      xs: 1,
      md: 1.25,
    },
    gap: 1,
  },
} as const satisfies FooterProps;

export default footerProps;