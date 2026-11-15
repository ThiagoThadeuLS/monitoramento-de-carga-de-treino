import { isNativeApp } from './nativeApp';

/**
 * Ponte do app nativo (iOS/Android via Capacitor).
 *
 * A versão web não executa nada daqui: as funções só são chamadas quando
 * `isNativeApp()` é verdadeiro. Assim o comportamento da Vercel não muda.
 */

export { isNativeApp };

/** Endereço público do app web (Vercel). Usado nas telas que abrem fora do app. */
export function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  return (configured || 'https://monitoramento-coral.vercel.app').replace(/\/+$/, '');
}

/** Endereço de uma página da versão web (privacidade, redefinir senha...). */
export function webUrl(path = '/'): string {
  return `${publicAppUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Link que o Supabase deve abrir depois do e-mail de redefinição de senha. */
export function authRedirectUrl(param: string): string {
  const origin = isNativeApp() ? publicAppUrl() : window.location.origin;
  return `${origin}/?${param}=1`;
}

/** Abre um endereço fora do app (navegador do celular). No computador, abre na própria aba. */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isNativeApp()) {
    window.location.href = url;
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'fullscreen' });
}

const NATIVE_PLATFORM = (): string => {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() ?? 'web';
};

let initialized = false;

/**
 * Ajustes que só existem no app instalado: barra de status, splash, botão voltar,
 * links externos, downloads e compartilhamento de arquivos.
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp() || initialized) return;
  initialized = true;

  installShareBridge();
  installDownloadBridge();
  installExternalLinkBridge();

  // Inicializa o OneSignal cedo: o toque numa notificação com o app fechado é entregue ao app.
  void import('./nativePush').then((m) => m.initNativePush()).catch(() => undefined);

  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/app'),
  ]).catch(
    () =>
      [
        { StatusBar: null, Style: null },
        { SplashScreen: null },
        { App: null },
      ] as const
  );

  if (StatusBar && Style) {
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    if (NATIVE_PLATFORM() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#020617' }).catch(() => undefined);
    }
  }

  // SplashScreen também esconde sozinho (launchAutoHide); aqui garantimos que não fique preso.
  await SplashScreen?.hide().catch(() => undefined);

  // Links profundos (carga://...) — hoje usados só para abrir uma aba/lembrete.
  App?.addListener('appUrlOpen', ({ url }) => {
    try {
      const incoming = new URL(url);
      const params = incoming.searchParams;
      const allowed = ['aba', 'treino', 'convite-clube', 'redefinir-senha', 'whoop', 'motivo'];
      if (!allowed.some((key) => params.has(key))) return;
      const query = params.toString();
      window.location.replace(`${window.location.pathname}${query ? `?${query}` : ''}`);
    } catch {
      // Link inválido: o app continua na tela atual
    }
  }).catch(() => undefined);
}

// ---------- Compartilhar arquivos (Web Share API) ----------

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });

const safeFileName = (name: string, fallback: string) => {
  const cleaned = (name || fallback).replace(/[\\/:*?"<>|]+/g, '-').trim();
  return cleaned || fallback;
};

/** Grava o arquivo na pasta temporária do app e devolve o endereço que o compartilhamento aceita. */
async function writeTempFile(blob: Blob, name: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = `compartilhar/${Date.now()}-${safeFileName(name, 'arquivo')}`;
  await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return uri;
}

/** Abre a folha de compartilhamento do celular com um ou mais arquivos. */
export async function shareFiles(files: File[], data: { text?: string; title?: string; url?: string } = {}): Promise<void> {
  const { Share } = await import('@capacitor/share');
  const uris = await Promise.all(files.map((file) => writeTempFile(file, file.name)));
  await Share.share({
    files: uris,
    text: data.text,
    title: data.title,
    url: data.url,
    dialogTitle: data.title,
  });
}

/**
 * Faz a Web Share API existente no app usar a folha nativa do Capacitor.
 * Sem isso, o WebView do iPhone não compartilha arquivos (só a versão web/Safari).
 */
function installShareBridge() {
  const nav = navigator as ShareNavigator;
  const canShare = (data?: ShareData) => Boolean(data?.files?.length);
  const share = async (data?: ShareData) => {
    if (!data) return;
    if (data.files?.length) {
      await shareFiles(Array.from(data.files), { text: data.text, title: data.title, url: data.url });
      return;
    }
    const { Share } = await import('@capacitor/share');
    await Share.share({ text: data.text, title: data.title, url: data.url, dialogTitle: data.title });
  };
  try {
    Object.defineProperty(nav, 'canShare', { value: canShare, configurable: true });
    Object.defineProperty(nav, 'share', { value: share, configurable: true });
  } catch {
    // WebView antigo sem suporte a sobrescrever: os botões caem no download
  }
}

// ---------- Downloads (CSV, cartões PNG) ----------

/**
 * No WebView, `a.download` não salva nada. Interceptamos esses cliques e abrimos
 * a folha de compartilhamento (salvar em Arquivos, enviar no WhatsApp etc.).
 */
function installDownloadBridge() {
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href;
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      const name = anchor.download || 'arquivo';
      fetch(href)
        .then((res) => res.blob())
        .then((blob) => shareFiles([new File([blob], name, { type: blob.type || 'application/octet-stream' })]))
        .catch((err) => console.warn('Não foi possível salvar o arquivo:', err));
    },
    true
  );
}

// ---------- Links externos ----------

/**
 * No app, navegar para um site dentro do WebView prende o usuário (e o OAuth da
 * WHOOP não volta). Links de outro domínio e a política de privacidade abrem no
 * navegador do celular.
 */
function installExternalLinkBridge() {
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || /^(mailto|tel|sms|javascript):/i.test(href)) return;

      const absolute = new URL(href, window.location.origin);
      const isExternalHttp = /^https?:/i.test(absolute.href) && absolute.origin !== window.location.origin;
      const isPrivacy = absolute.pathname === '/privacidade' || absolute.pathname === '/privacidade/';
      if (!isExternalHttp && !isPrivacy) return;

      event.preventDefault();
      const target = isPrivacy ? webUrl('/privacidade') : absolute.href;
      openExternalUrl(target).catch(() => undefined);
    },
    true
  );
}
