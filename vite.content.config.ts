import { defineConfig } from 'vite';
import path from 'node:path';

// content script 构建：单入口 IIFE，输出固定文件名 dist/content.js。
// 关键：emptyOutDir: false，避免清掉主构建产物。禁止在 src/content 中使用动态 import()。
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome138',
    minify: true,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, 'src/content/main.ts'),
      formats: ['iife'],
      name: 'WpxContent',
      fileName: () => 'content.js',
    },
  },
});
