import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        content: path.resolve(__dirname, 'src/ts/content.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'js/content.js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
    // Важно: не очищать папку dist, так как сборки идут одна за другой
    emptyOutDir: false, 
  },
  resolve: {
    alias: {
      '@ts': path.resolve(__dirname, 'src/ts'),
    },
  },
})