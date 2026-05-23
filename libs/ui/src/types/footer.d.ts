// libs/ui/src/types/footer.ts

export type FooterLinkTarget = '_self' | '_blank' | '_parent' | '_top';

export type FooterLinkInput = {
  label?: string | null;
  name?: string | null;
  title?: string | null;
  href?: string | null;
  url?: string | null;
  target?: FooterLinkTarget | string | null;
  rel?: string | null;
  external?: boolean | null;
  disabled?: boolean | null;
};

export type NormalizedFooterLink = {
  label: string;
  href: string;
  target?: FooterLinkTarget;
  rel?: string;
  external: boolean;
  disabled: boolean;
};

export type FooterLinkGroupInput = {
  title?: string | null;
  label?: string | null;
  links?: FooterLinkInput[] | null;
};

export type NormalizedFooterLinkGroup = {
  title: string;
  links: NormalizedFooterLink[];
};

export type BuildCopyrightTextOptions = {
  holder?: string;
  startYear?: number;
  currentYear?: number;
  prefix?: string;
  suffix?: string;
};

export type BuildFooterRelOptions = {
  href?: string;
  target?: string;
  rel?: string | null;
};

export type BuildReleaseUrlOptions = {
  baseUrl: string;
  version: string | number | null | undefined;
};

import type {
  HTMLAttributeAnchorTarget,
  ReactNode,
} from 'react';

import type { BoxProps } from '@mui/material/Box';
import type { ButtonProps } from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import type { StaticImageData } from 'next/image';

export type FooterLinkTarget = '_self' | '_blank' | '_parent' | '_top';

export type FooterLinkInput = {
  label?: string | null;
  name?: string | null;
  title?: string | null;
  href?: string | null;
  url?: string | null;
  target?: FooterLinkTarget | string | null;
  rel?: string | null;
  external?: boolean | null;
  disabled?: boolean | null;
};

export type NormalizedFooterLink = {
  label: string;
  href: string;
  target?: FooterLinkTarget;
  rel?: string;
  external: boolean;
  disabled: boolean;
};

export type FooterLinkGroupInput = {
  title?: string | null;
  label?: string | null;
  links?: readonly FooterLinkInput[] | null;
};

export type NormalizedFooterLinkGroup = {
  title: string;
  links: NormalizedFooterLink[];
};

export type BuildCopyrightTextOptions = {
  holder?: string;
  startYear?: number;
  currentYear?: number;
  prefix?: string;
  suffix?: string;
};

export type BuildFooterRelOptions = {
  href?: string;
  target?: string;
  rel?: string | null;
};

export type BuildReleaseUrlOptions = {
  baseUrl: string;
  version: string | number | null | undefined;
};

export type FooterLogo = string | StaticImageData | ReactNode;

export type FooterVariant = 'default' | 'glass' | 'minimal';

export type FooterSocialLink = FooterLinkInput & {
  icon?: ReactNode;
  ariaLabel?: string;
};

export type FooterAction = {
  label: ReactNode;
  href?: string;
  onClick?: ButtonProps['onClick'];
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  disabled?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

export interface FooterProps extends Omit<BoxProps, 'children' | 'sx'> {
  brandName?: ReactNode;
  tagline?: ReactNode;
  logo?: FooterLogo;
  logoAlt?: string;
  logoHref?: string;

  version?: string | number | null;
  versionPrefix?: string;
  releasesUrl?: string;

  linkGroups?: readonly FooterLinkGroupInput[];
  legalLinks?: readonly FooterLinkInput[];
  socialLinks?: readonly FooterSocialLink[];
  actions?: readonly FooterAction[];

  copyrightHolder?: string;
  copyrightStartYear?: number;
  copyrightText?: string;

  children?: ReactNode;

  variant?: FooterVariant;
  maxWidth?: number | string;
  dense?: boolean;

  sx?: SxProps<Theme>;
  containerSx?: SxProps<Theme>;
  brandSx?: SxProps<Theme>;
  linkGroupSx?: SxProps<Theme>;
  bottomSx?: SxProps<Theme>;
}

export type FooterBrandProps = {
  brandName?: ReactNode;
  tagline?: ReactNode;
  logo?: FooterLogo;
  logoAlt: string;
  logoHref: string;
  brandSx?: SxProps<Theme>;
};

export type FooterLinkGroupsProps = {
  groups: NormalizedFooterLinkGroup[];
  pathname: string | null;
  linkGroupSx?: SxProps<Theme>;
};

export type FooterSocialLinksProps = {
  socialLinks: readonly FooterSocialLink[];
};