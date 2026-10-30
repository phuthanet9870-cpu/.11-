import { defineConfig } from 'vite';

// `--mode portable` builds one script with no separate chunks, for the single-file build
// (scripts/build-portable.mjs) that runs when index.html is opened straight from disk.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    ...(mode === 'portable' ? { outDir: 'dist-portable', copyPublicDir: false, rollupOptions: { output: { inlineDynamicImports: true } } } : {}),
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
}) as never);
