/**
 * Detecta se o app está rodando dentro do Capacitor (iOS/Android instalado).
 * Fica num arquivo separado e sem dependências para poder ser importado pela
 * versão web sem trazer nenhum código nativo para o pacote da Vercel.
 */
export function isNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
