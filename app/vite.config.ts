import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
  build: {
    rolldownOptions: {
      external: ['cytoscape-svg'],
      onwarn(warning, warn) {
        // Suppress unresolved import warnings for optional plugins
        if (warning.code === 'UNRESOLVED_IMPORT' && warning.exporter === 'cytoscape-svg') return;
        warn(warning);
      },
    },
  },
})
