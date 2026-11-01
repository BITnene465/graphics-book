import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5017, strictPort: true },
  build: { target: 'es2022' },
});
