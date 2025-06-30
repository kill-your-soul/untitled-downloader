import { defineConfig } from 'vite'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/js/background.js'),
        content: path.resolve(__dirname, 'src/js/content.js'),
        offscreen: path.resolve(__dirname, 'src/ts/offscreen.ts'),
      },
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.js')) {
            return 'js/[name][extname]'
          }
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/[name][extname]'
          }
          return '[name][extname]'
        },
      },
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