import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './lib/push';
import { initNativeApp } from './lib/native';
import { applyCachedTheme } from './lib/theme';
import { DialogsProvider } from './components/ui/Dialogs';

// Cores do clube salvas neste aparelho (antes de carregar)
applyCachedTheme();

// Apps das lojas (iOS/Android): barra de status, splash, links e downloads.
// Na versão web esta chamada não faz nada.
void initNativeApp();

// App instalável + notificações (PWA)
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogsProvider>
      <App />
    </DialogsProvider>
  </React.StrictMode>
);
