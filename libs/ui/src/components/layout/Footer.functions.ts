// libs/ui/src/utils/footer.ts

import type {
  BuildCopyrightTextOptions,
  BuildFooterRelOptions,
  BuildReleaseUrlOptions,
  FooterLinkGroupInput,
  FooterLinkInput,
  FooterLinkTarget,
  NormalizedFooterLink,
  NormalizedFooterLinkGroup,
  UnknownRecord,
} from '../../types';

export const DEFAULT_COPYRIGHT_HOLDER = 'SinLess Games LLC';

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

export function normalizeVersion(
  version: string | number | null | undefined,
): string {
  if (version === null || version === undefined) {
    return '';
  }

  return String(version).trim().replace(/^v/i, '');
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function buildCopyrightText({
  holder = DEFAULT_COPYRIGHT_HOLDER,
  startYear,
  currentYear = getCurrentYear(),
  prefix = '©',
  suffix = 'All rights reserved.',
}: BuildCopyrightTextOptions = {}): string {
  const normalizedHolder = normalizeText(holder) ?? DEFAULT_COPYRIGHT_HOLDER;
  const normalizedPrefix = normalizeText(prefix) ?? '©';
  const normalizedSuffix = normalizeText(suffix);

  const yearText =
    typeof startYear === 'number' && startYear > 0 && startYear < currentYear
      ? `${startYear}-${currentYear}`
      : String(currentYear);

  return [normalizedPrefix, yearText, normalizedHolder, normalizedSuffix]
    .filter(Boolean)
    .join(' ');
}

export function isExternalUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    /^(https?:)?\/\//i.test(url) ||
    /^mailto:/i.test(url) ||
    /^tel:/i.test(url)
  );
}

export function isInternalUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    url.startsWith('/') ||
    url.startsWith('#') ||
    url.startsWith('?') ||
    url.startsWith('./') ||
    url.startsWith('../')
  );
}

export function normalizeHref(
  value: string | null | undefined,
): string | undefined {
  const href = normalizeText(value);

  if (!href) {
    return undefined;
  }

  return href;
}

export function normalizeFooterTarget(
  target: string | null | undefined,
  external: boolean,
): FooterLinkTarget | undefined {
  const normalized = normalizeText(target);

  if (
    normalized === '_self' ||
    normalized === '_blank' ||
    normalized === '_parent' ||
    normalized === '_top'
  ) {
    return normalized;
  }

  return external ? '_blank' : undefined;
}

export function buildFooterRel({
  href,
  target,
  rel,
}: BuildFooterRelOptions): string | undefined {
  const normalizedRel = normalizeText(rel);

  if (normalizedRel) {
    return normalizedRel;
  }

  if (href && isExternalUrl(href) && target !== '_self') {
    return 'noopener noreferrer';
  }

  return undefined;
}

export function normalizeFooterLink(
  link: FooterLinkInput | null | undefined,
): NormalizedFooterLink | null {
  if (!link) {
    return null;
  }

  const label =
    normalizeText(link.label) ??
    normalizeText(link.name) ??
    normalizeText(link.title);

  const href = normalizeHref(link.href ?? link.url);

  if (!label || !href) {
    return null;
  }

  const external = link.external ?? isExternalUrl(href);
  const target = normalizeFooterTarget(link.target, external);
  const rel = buildFooterRel({
    href,
    target,
    rel: link.rel,
  });

  return {
    label,
    href,
    target,
    rel,
    external,
    disabled: Boolean(link.disabled),
  };
}

export function normalizeFooterLinks(
  links: readonly FooterLinkInput[] | null | undefined,
): NormalizedFooterLink[] {
  if (!links?.length) {
    return [];
  }

  return links
    .map((link) => normalizeFooterLink(link))
    .filter((link): link is NormalizedFooterLink => Boolean(link));
}

export function normalizeFooterLinkGroup(
  group: FooterLinkGroupInput | null | undefined,
): NormalizedFooterLinkGroup | null {
  if (!group) {
    return null;
  }

  const title = normalizeText(group.title) ?? normalizeText(group.label);
  const links = normalizeFooterLinks(group.links ?? []);

  if (!title || links.length === 0) {
    return null;
  }

  return {
    title,
    links,
  };
}

export function normalizeFooterLinkGroups(
  groups: readonly FooterLinkGroupInput[] | null | undefined,
): NormalizedFooterLinkGroup[] {
  if (!groups?.length) {
    return [];
  }

  return groups
    .map((group) => normalizeFooterLinkGroup(group))
    .filter((group): group is NormalizedFooterLinkGroup => Boolean(group));
}

export function buildVersionLabel(
  version: string | number | null | undefined,
  prefix = 'V',
): string {
  const normalizedVersion = normalizeVersion(version);

  if (!normalizedVersion) {
    return '';
  }

  return `${prefix}${normalizedVersion}`;
}

export function buildReleaseUrl({
  baseUrl,
  version,
}: BuildReleaseUrlOptions): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedVersion = normalizeVersion(version);

  if (!normalizedVersion) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/tag/v${encodeURIComponent(normalizedVersion)}`;
}

export function normalizePathname(value: string): string {
  const [withoutHash] = value.split('#');
  const [withoutQuery] = withoutHash.split('?');

  if (!withoutQuery) {
    return '/';
  }

  const pathname = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;

  if (pathname === '/') {
    return pathname;
  }

  return pathname.replace(/\/+$/, '');
}

export function isActiveFooterPath(
  pathname: string | null | undefined,
  href: string | null | undefined,
): boolean {
  if (!pathname || !href || isExternalUrl(href)) {
    return false;
  }

  const currentPath = normalizePathname(pathname);
  const targetPath = normalizePathname(href);

  if (targetPath === '/') {
    return currentPath === '/';
  }

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function getObjectString(
  value: unknown,
  keys: readonly string[],
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = normalizeText(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function buildSocialAriaLabel(platform: string, label?: string): string {
  const normalizedPlatform = normalizeText(platform) ?? 'Social link';
  const normalizedLabel = normalizeText(label);

  if (!normalizedLabel || normalizedLabel === normalizedPlatform) {
    return `Open ${normalizedPlatform}`;
  }

  return `Open ${normalizedLabel} on ${normalizedPlatform}`;
}