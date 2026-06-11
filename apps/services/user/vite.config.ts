import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(root, '../../..');

export default defineConfig({
  root,
  cacheDir: join(workspaceRoot, 'node_modules/.vite/apps/services/user'),

  resolve: {
    alias: {
      '@aerealith-ai/api': resolve(workspaceRoot, 'libs/api/src/index.ts'),
      '@aerealith-ai/config': resolve(workspaceRoot, 'libs/config/src/index.ts'),
      '@aerealith-ai/contracts': resolve(
        workspaceRoot,
        'libs/contracts/src/index.ts',
      ),
      '@aerealith-ai/db': resolve(workspaceRoot, 'libs/db/src/index.ts'),
      '@aerealith-ai/flags': resolve(workspaceRoot, 'libs/flags/src/index.ts'),
      '@aerealith-ai/observability': resolve(
        workspaceRoot,
        'libs/observability/src/worker.ts',
      ),
    },
  },

  build: {
    emptyOutDir: true,
    outDir: resolve(workspaceRoot, 'dist/apps/services/user'),
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',

    lib: {
      entry: resolve(root, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },

    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
