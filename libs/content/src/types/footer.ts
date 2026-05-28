import type { AnchorTarget, LooseStyleObject } from './card';

export type FooterVariant = 'default' | 'minimal' | 'expanded';

export interface FooterLink {
  label: string;
  href: string;
  target?: AnchorTarget;
  rel?: string;
  ariaLabel?: string;
}

export interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  brandName: string;
  tagline?: string;
  logoHref?: string;

  version?: string | null;
  versionPrefix?: string;
  releasesUrl?: string;

  variant?: FooterVariant;
  dense?: boolean;
  maxWidth?: string | number;

  linkGroups?: FooterLinkGroup[];
  socialLinks?: FooterLink[];
  legalLinks?: FooterLink[];

  copyrightHolder: string;
  copyrightStartYear?: number;
  copyrightText?: string;

  sx?: LooseStyleObject;
  containerSx?: LooseStyleObject;
  brandSx?: LooseStyleObject;
  linkGroupSx?: LooseStyleObject;
  bottomSx?: LooseStyleObject;
}
