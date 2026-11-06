import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 4313,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: { '/api': 'http://127.0.0.1:4310' },
  },
});
