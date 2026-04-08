import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.glb', '**/*.mp3', '**/*.mid'],
  server: {
    open: true
  }
});
