import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(appRoot, '.next/server/middleware-manifest.json');

const emptyMiddlewareManifest = {
  version: 3,
  middleware: {},
  functions: {},
  sortedMiddleware: [],
};

mkdirSync(dirname(manifestPath), { recursive: true });

if (!existsSync(manifestPath)) {
  writeFileSync(
    manifestPath,
    `${JSON.stringify(emptyMiddlewareManifest, null, 2)}\n`,
    'utf8',
  );
}