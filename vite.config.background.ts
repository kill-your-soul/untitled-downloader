import { defineConfig } from 'vite'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import fs from 'fs' // 1. Импортируем fs

// 2. Читаем и парсим package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

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
    emptyOutDir: true, 
  },
  plugins: [
    viteStaticCopy({
      targets: [
        // 3. Модифицируем копирование манифеста
        {
          src: 'public/manifest.json',
          dest: '.',
          transform: (content) => {
            const manifest = JSON.parse(content.toString());
            // Устанавливаем версию из package.json
            manifest.version = packageJson.version;
            // Возвращаем измененный манифест в виде красивой JSON-строки
            return JSON.stringify(manifest, null, 2);
          }
        },
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