import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localBuild = process.env.APPDEPLOY_LOCAL_BUILD === 'true';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      external: localBuild ? ['@appdeploy/client'] : [],
      maxParallelFileOps: 128,
    },
  },
});
