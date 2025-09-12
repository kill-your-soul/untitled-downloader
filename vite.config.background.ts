import { defineConfig } from 'vite'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/ts/background.ts'),
        offscreen: path.resolve(__dirname, 'src/ts/offscreen.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
    // Очищать папку dist только при первой сборке
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