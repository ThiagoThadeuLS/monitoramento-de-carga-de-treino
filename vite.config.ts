import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Em produção o Vercel reescreve /privacidade para /privacidade.html (ver vercel.json).
 * No servidor de desenvolvimento/preview o Vite não lê o vercel.json, então fazemos
 * a mesma reescrita aqui para a página abrir em /privacidade também localmente.
 */
function privacyPage(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, _res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/privacidade' || path === '/privacidade/') req.url = '/privacidade.html';
    next();
  };
  return {
    name: 'privacy-page',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), privacyPage()],
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas em arquivos próprios: mudam pouco, então ficam guardadas no aparelho
        // entre uma versão e outra do app (só o código do app é baixado de novo)
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
