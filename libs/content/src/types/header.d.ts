import type { Page } from './page';

export interface HeaderLink {
  name: string;
  url: string;
}

export type HeaderStyle = Record<string, string | number>;

export interface HeaderProps {
  logo: string;
  title: string;
  version: string;
  pages: readonly Page[];
  style?: HeaderStyle;
}