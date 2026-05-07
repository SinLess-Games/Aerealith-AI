const { withNx } = require('@nx/rollup/with-nx');
const url = require('@rollup/plugin-url');
const svgr = require('@svgr/rollup');

const svg = svgr.default ?? svgr;

module.exports = withNx(
  {
    main: './src/index.ts',
    outputPath: '../../dist/libs/ui',
    tsConfig: './tsconfig.lib.json',
    compiler: 'babel',
    external: [
      // React
      'react',
      'react-dom',
      'react/jsx-runtime',

      // Helix workspaces
      '@helix-ai/config',
      '@helix-ai/flags',

      // MUI & Emotion
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',

      // Grafana Faro SDK
      // Keep these out of the UI bundle.
      '@grafana/faro-react',
      '@grafana/faro-web-sdk',
      '@grafana/faro-web-tracing'
    ],
    format: ['esm'],
    assets: [
      {
        input: '.',
        output: '.',
        glob: 'README.md'
      }
    ],
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false
      }
    }
  },
  {
    plugins: [
      svg({
        svgo: false,
        titleProp: true,
        ref: true
      }),
      url({
        limit: 10_000
      })
    ]
  }
);