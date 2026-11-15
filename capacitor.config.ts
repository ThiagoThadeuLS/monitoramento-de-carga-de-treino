import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração dos apps iOS e Android (Capacitor).
 *
 * O app web continua sendo o mesmo (React + Vite) e o deploy da Vercel não usa
 * este arquivo. Para gerar os apps: npm run native:sync (ou native:ios / native:android).
 *
 * appId: identificador definitivo nas lojas. Troque aqui ANTES de criar os
 * projetos nas lojas (App Store Connect / Play Console) — depois não pode mudar.
 */
const config: CapacitorConfig = {
  appId: 'br.com.monitoramentocarga.app',
  appName: 'Carga',
  webDir: 'dist',
  backgroundColor: '#020617',
  ios: {
    // O OneSignal cuida das notificações no iOS (sem isso, o Capacitor assume o
    // recebimento e os avisos não aparecem com o app aberto).
    handleApplicationNotifications: false,
    // O layout do app já respeita o entalhe/barra de status (env(safe-area-inset-*)).
    contentInset: 'never',
  },
  android: {
    // O WebView não deve liberar conteúdo misto (http) em produção.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#020617',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // "DARK" = texto claro para fundo escuro (o app é escuro).
      style: 'DARK',
      backgroundColor: '#020617',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
