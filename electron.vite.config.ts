import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shared = { '@shared': resolve(__dirname, 'src/shared') };
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    define: { __BUILD_STAMP__: JSON.stringify(stamp) },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { ...shared, '@': resolve(__dirname, 'src/renderer/src') } },
  },
});
