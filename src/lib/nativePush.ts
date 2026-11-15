import { supabase } from './supabase';
import { isNativeApp, openExternalUrl, publicAppUrl } from './native';
import type { PushState } from './push';

/**
 * Lembretes no app nativo (iOS/Android) pelo OneSignal.
 *
 * A versão web continua usando Web Push (public/sw.js + Edge Function enviar-lembretes).
 * Aqui o aparelho é identificado pelo id do atleta (External ID do OneSignal), então a
 * função de envio consegue mandar o lembrete certo para cada pessoa.
 *
 * Sem VITE_ONESIGNAL_APP_ID no build, o app nativo avisa que as notificações não estão
 * configuradas (a permissão não pode ser pedida sem o App ID do OneSignal).
 */
const APP_ID = (import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined)?.trim() ?? '';

type OneSignalSdk = typeof import('@onesignal/capacitor-plugin').default;

let sdkPromise: Promise<OneSignalSdk> | null = null;

/** Inicializa o OneSignal logo na abertura do app (antes do login do atleta). */
export async function initNativePush(): Promise<boolean> {
  if (!isNativeApp() || !APP_ID) return false;
  try {
    await loadSdk();
    return true;
  } catch (err) {
    console.warn('OneSignal não inicializou:', err);
    return false;
  }
}

function loadSdk(): Promise<OneSignalSdk> {
  if (!APP_ID) return Promise.reject(new Error('OneSignal não configurado neste build.'));
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const { default: OneSignal } = await import('@onesignal/capacitor-plugin');
      await OneSignal.initialize(APP_ID);
      OneSignal.Notifications.addEventListener('click', (event) => {
        const raw = event.result.url || (event.notification.additionalData as { url?: string } | null)?.url;
        if (!raw) return;
        try {
          const target = new URL(raw, window.location.origin);
          const appOrigin = new URL(publicAppUrl()).origin;
          if (target.origin === window.location.origin || target.origin === appOrigin) {
            window.location.replace(`${target.pathname}${target.search}${target.hash}`);
          } else {
            void openExternalUrl(target.href);
          }
        } catch {
          // Link inválido: ignora e mantém o app aberto
        }
      });
      return OneSignal;
    })().catch((err) => {
      sdkPromise = null;
      throw err;
    });
  }
  return sdkPromise;
}

/** Id do atleta logado (o banco descobre pelo token da sessão). */
async function athleteIdFor(token: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('athlete_get_session', { p_token: token });
  if (error) return null;
  return (data as { athlete?: { id?: string } } | null)?.athlete?.id ?? null;
}

/** Liga este aparelho ao atleta no OneSignal (o servidor envia por esse id). */
async function linkAthlete(token: string): Promise<void> {
  const sdk = await loadSdk();
  const athleteId = await athleteIdFor(token);
  if (athleteId) await sdk.login(athleteId);
}

/** Situação das notificações neste aparelho (permissão + opt-in). */
export async function nativePushState(): Promise<PushState> {
  if (!APP_ID) return import.meta.env.DEV ? 'on' : 'unsupported';
  try {
    const sdk = await loadSdk();
    const granted = await sdk.Notifications.hasPermission();
    if (granted) {
      const optedIn = await sdk.User.pushSubscription.getOptedInAsync();
      return optedIn ? 'on' : 'off';
    }
    const canAsk = await sdk.Notifications.canRequestPermission();
    return canAsk ? 'off' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Pede a permissão do sistema e registra o aparelho para o atleta logado. */
export async function nativeEnablePush(token: string): Promise<PushState> {
  const sdk = await loadSdk();
  const granted = await sdk.Notifications.requestPermission(true);
  if (!granted) {
    const canAsk = await sdk.Notifications.canRequestPermission().catch(() => false);
    return canAsk ? 'off' : 'denied';
  }
  // O pedido de permissão pode ter demorado: liga de novo ao atleta atual antes de ativar.
  await linkAthlete(token);
  await sdk.User.pushSubscription.optIn();
  return 'on';
}

/**
 * Ao abrir o app com os lembretes já ativos, garante que o OneSignal continua
 * apontando para o atleta certo (troca de conta no mesmo aparelho).
 */
export async function nativeRelinkPush(token: string): Promise<'ok' | 'expired'> {
  if (!APP_ID) return 'ok';
  try {
    const sdk = await loadSdk();
    if (!(await sdk.Notifications.hasPermission())) return 'ok';
    await linkAthlete(token);
    if (!(await sdk.User.pushSubscription.getOptedInAsync())) await sdk.User.pushSubscription.optIn();
    return 'ok';
  } catch (err) {
    console.warn('Não foi possível religar as notificações:', err);
    return 'ok';
  }
}

/** Saiu do app: o próximo atleta não herda os avisos do anterior. */
export async function nativePushLogout(): Promise<void> {
  if (!isNativeApp() || !APP_ID) return;
  try {
    const sdk = await loadSdk();
    await sdk.logout();
  } catch {
    // Sem SDK inicializado (ou sem internet) não há usuário para deslogar
  }
}
