import { defineConfig } from 'vite';
import path from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// 主构建：background service worker（ES module）+ options 页。
// 必须先于 vite.content.config.ts 运行（本配置 emptyOutDir: true 会清空 dist）。
export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [{ src: 'manifest.json', dest: '.' }],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome138',
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/index.ts'),
        options: path.resolve(__dirname, 'src/options/index.html'),
      },
      output: {
        // manifest 直接引用 background.js，文件名必须固定
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
