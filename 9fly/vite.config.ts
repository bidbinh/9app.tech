import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the 9app hub at /9fly/ and by `npm run dev` at the same base.
export default defineConfig({
  base: '/9fly/',
  plugins: [react()],
  server: { port: 5173, host: true, strictPort: true },
  preview: { port: 4173, host: true },
});
