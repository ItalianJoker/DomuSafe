import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // The API client and its schemas are shared with later screens. Keep them in a
        // preloaded chunk so the first script stays inside the shell budget.
        codeSplitting: {
          groups: [{ name: 'api', test: /\/(src\/lib\/api\.ts|packages\/contracts\/src\/)/ }],
        },
      },
    },
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
    conditions: ['@domusafe/source'],
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['localStorage', 'baseLocale'],
      emitTsDeclarations: true,
      isServer: 'import.meta.env.SSR',
    }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'DomuSafe',
        short_name: 'DomuSafe',
        description: 'Casa, famiglia e documenti importanti.',
        lang: 'it',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#08090a',
        theme_color: '#08090a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
    },
  },
});
