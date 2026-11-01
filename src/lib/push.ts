import { supabase } from './supabase';

// Chave pública VAPID (a privada fica só no Supabase, como segredo da função enviar-lembretes)
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

export type PushState =
  | 'unsupported'   // navegador sem notificações
  | 'needs-install' // iPhone/iPad: precisa adicionar à tela de início primeiro
  | 'denied'        // usuário bloqueou as notificações
  | 'off'           // pode ativar
  | 'on';           // ativo neste aparelho

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Celular ou tablet (no computador as notificações são opcionais). */
export const isMobileDevice = () =>
  isIOS() || /Android|Mobi|iPhone|iPod/i.test(navigator.userAgent);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

// Android/Chrome: guarda o pedido de instalação para o botão "Instalar app"
let installPrompt: any = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installListeners.forEach((fn) => fn());
  });
}
export const canPromptInstall = () => !!installPrompt;
export const onInstallChange = (fn: () => void) => {
  installListeners.add(fn);
  return () => void installListeners.delete(fn);
};
/** Abre o pedido de instalação do Chrome. Retorna true se o atleta aceitou. */
export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  return outcome === 'accepted';
}

/** Registra o service worker (chamado ao abrir o app). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker não registrado:', err));
  });
}

function base64UrlToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const toBase64Url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  // No celular, só funciona como app instalado: a notificação aparece com o nome e o ícone do app
  // (e não como "Chrome"), e o Android não a trata como possível spam de site.
  if (isMobileDevice() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID_PUBLIC_KEY) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

async function saveSubscription(token: string, sub: PushSubscription) {
  const { error } = await supabase!.rpc('athlete_save_push', {
    p_token: token,
    p_endpoint: sub.endpoint,
    p_p256dh: toBase64Url(sub.getKey('p256dh')),
    p_auth: toBase64Url(sub.getKey('auth')),
    p_user_agent: navigator.userAgent,
  });
  return error;
}

/**
 * Aparelho que já aceitou as notificações: liga de novo ao atleta que entrou,
 * sem perguntar outra vez (a permissão fica permanente no aparelho).
 */
export async function relinkPush(token: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !supabase) return;
  const sub = await currentSubscription().catch(() => null);
  if (sub) await saveSubscription(token, sub).catch(() => undefined);
}

/** Pede permissão, cria a assinatura neste aparelho e salva para o atleta logado. */
export async function enablePush(token: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  // Sem resposta do serviço de notificações em 20 s (rede ruim, economia de bateria...): avisa em vez de travar
  const withTimeout = <T,>(p: Promise<T>) =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('O celular demorou para responder. Confira a internet e toque em "Permitir notificações" de novo.')), 20000)
      ),
    ]);
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'));
  await withTimeout(navigator.serviceWorker.ready);
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) })));

  const error = await saveSubscription(token, sub);
  if (error) {
    await sub.unsubscribe().catch(() => undefined);
    if (/Could not find the function/.test(error.message)) {
      throw new Error('Os lembretes ainda não foram ativados no banco (supabase_lembretes.sql).');
    }
    throw new Error('Não foi possível ativar os lembretes. Tente novamente.');
  }
  return 'on';
}

/** Desativa os lembretes neste aparelho (também usado ao sair do app). */
export async function disablePush(token: string | null): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  if (token && supabase) await supabase.rpc('athlete_remove_push', { p_token: token, p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}
