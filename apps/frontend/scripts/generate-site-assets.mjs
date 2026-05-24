import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(appRoot, '../..');
const publicRoot = join(appRoot, 'public');
const appDir = join(appRoot, 'src/app');
const siteUrl = normalizeSiteUrl(
  process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'https://helixaibot.com',
);

const tokenPaths = [
  join(repoRoot, 'libs/ui/src/theme/tokens/aerealith-brand-tokens.json'),
  join(repoRoot, 'Docs/New_Branding/tokens/aerealith-brand-tokens.json'),
];

const brandTokens = await readBrandTokens(tokenPaths);
const icons = await discoverManifestIcons(join(publicRoot, 'icons'));
const routes = await discoverAppRoutes(appDir);

await writeManifest(join(publicRoot, 'site.webmanifest'), brandTokens, icons);
await writeSitemap(join(publicRoot, 'site.xml'), routes, siteUrl);

console.log(
  `Generated public/site.webmanifest and public/site.xml for ${routes.length} route${routes.length === 1 ? '' : 's'}.`,
);

async function readBrandTokens(paths) {
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    return JSON.parse(await readFile(path, 'utf8'));
  }

  return {
    brand: 'Helix AI',
    taglines: ['Adaptive AI assistant platform.'],
    colors: {
      deepNight: '#050A1E',
      voidNavy: '#08071B',
    },
  };
}

async function discoverManifestIcons(iconDir) {
  if (!existsSync(iconDir)) {
    return [];
  }

  const iconFiles = await readdir(iconDir);

  return iconFiles
    .map((file) => {
      const match = /^icon-(\d+)\.png$/u.exec(file);

      if (!match) {
        return null;
      }

      const size = Number(match[1]);

      return {
        src: `/icons/${file}`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose: size >= 192 ? 'any maskable' : 'any',
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sizes.split('x')[0]) - Number(b.sizes.split('x')[0]));
}

async function discoverAppRoutes(root) {
  const pages = await walk(root);
  const routeEntries = await Promise.all(
    pages
      .filter((path) => path.endsWith(`${sep}page.tsx`) || path.endsWith(`${sep}page.ts`))
      .map(async (path) => ({
        path,
        route: routeFromPage(root, path),
        modified: (await stat(path)).mtime,
      })),
  );

  return routeEntries
    .filter(({ route }) => route !== null)
    .sort((a, b) => a.route.localeCompare(b.route));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        return walk(path);
      }

      if (entry.isFile()) {
        return [path];
      }

      return [];
    }),
  );

  return files.flat();
}

function routeFromPage(root, pagePath) {
  const relativePath = relative(root, pagePath);
  const segments = relativePath.split(sep).slice(0, -1);
  const routeSegments = [];

  for (const segment of segments) {
    if (
      segment.startsWith('_') ||
      segment.startsWith('@') ||
      segment.includes('[') ||
      extname(segment)
    ) {
      return null;
    }

    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }

    routeSegments.push(segment);
  }

  return `/${routeSegments.join('/')}`.replace(/\/$/u, '') || '/';
}

async function writeManifest(path, tokens, manifestIcons) {
  const colors = tokens.colors ?? {};
  const taglines = Array.isArray(tokens.taglines) ? tokens.taglines : [];
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? tokens.brand ?? 'Helix AI';
  const shortName =
    process.env.NEXT_PUBLIC_APP_SHORT_NAME ??
    tokens.shortName ??
    name.replace(/\s+AI$/u, '').slice(0, 12);

  const manifest = {
    name,
    short_name: shortName,
    description:
      process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
      taglines[0] ??
      'Adaptive AI assistant platform.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: colors.voidNavy ?? colors.deepNight ?? '#08071B',
    theme_color: colors.deepNight ?? colors.voidNavy ?? '#050A1E',
    icons: manifestIcons,
  };

  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function writeSitemap(path, routeEntries, baseUrl) {
  const urls = routeEntries
    .map(({ route, modified }) => {
      const loc = escapeXml(new URL(route, `${baseUrl}/`).toString());
      const lastmod = modified.toISOString().slice(0, 10);

      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        route === '/' ? '    <priority>1.0</priority>' : '    <priority>0.8</priority>',
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');

  await writeFile(path, sitemap, 'utf8');
}

function normalizeSiteUrl(value) {
  return value.replace(/\/+$/u, '');
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
