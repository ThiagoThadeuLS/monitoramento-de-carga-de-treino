export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Compartilha uma imagem pela folha nativa do aparelho (Instagram, WhatsApp...).
 * Onde o navegador não aceita arquivos, baixa a imagem e avisa para publicar.
 * O arquivo nunca vai para o Storage: é gerado na hora e descartado.
 */
export async function shareImage(file: File, text: string, title: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title });
      return 'shared';
    } catch (err) {
      // Fechar a folha de compartilhamento não é erro
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
