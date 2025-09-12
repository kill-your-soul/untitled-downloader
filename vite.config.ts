import { defineConfig } from 'vite'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/ts/background.ts'),
        content: path.resolve(__dirname, 'src/ts/content.ts'),
        offscreen: path.resolve(__dirname, 'src/ts/offscreen.ts'),
      },
      output: [
        {
          format: 'es',
          inlineDynamicImports: false,
          entryFileNames: (chunk) => {
            // Don't create a separate file for the 'content' script in this output
            if (chunk.name === 'content') {
              return 'unused/[name].js';
            }
            return 'js/[name].js';
          },
          chunkFileNames: 'js/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
        {
          format: 'iife',
          inlineDynamicImports: false,
          entryFileNames: (chunk) => {
            // Only create the 'content' script in this iife output
            if (chunk.name === 'content') {
              return 'js/content.js';
            }
            return 'unused/[name]-iife.js';
          },
          assetFileNames: 'assets/[name][extname]',
        },
      ],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'src/js/jszip.min.js', dest: 'js' },
        { src: 'src/html/offscreen.html', dest: 'html' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@ts': path.resolve(__dirname, 'src/ts'),
    },
  },
})