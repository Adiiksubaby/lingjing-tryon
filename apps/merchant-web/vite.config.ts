import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 4311,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: { '/api': 'http://127.0.0.1:4310' },
  },
});
