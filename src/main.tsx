import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './lib/push';
import { applyCachedTheme } from './lib/theme';

// Cores do clube salvas neste aparelho (antes de carregar)
applyCachedTheme();

// App instalável + notificações (PWA)
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
