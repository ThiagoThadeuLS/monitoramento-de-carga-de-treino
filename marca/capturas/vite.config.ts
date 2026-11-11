// App de verdade com o banco falso (fakeSupabase.ts), para tirar fotos das telas.
// Rodar: npx vite --config marca/capturas/vite.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const raiz = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: raiz,
  plugins: [react()],
  resolve: {
    alias: { '@supabase/supabase-js': fileURLToPath(new URL('./fakeSupabase.ts', import.meta.url)) },
  },
  server: { port: 5175, strictPort: true },
});
