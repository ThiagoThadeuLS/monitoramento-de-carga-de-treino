import { supabase } from './supabase';
import { sendAthletePhoto } from './athleteAuth';

// Fotos de atletas e treinadores: reduzidas no navegador e guardadas no Storage
// (bucket público "fotos"). Cada arquivo fica pequeno (512 px, ~30–80 KB), então
// o uso do plano gratuito continua baixo. Cada pessoa fica com uma foto só: ao trocar,
// as anteriores da pasta dela são apagadas.

export const PHOTO_BUCKET = 'fotos';
/** Lado da imagem quadrada que vai para o Storage. */
export const PHOTO_SIZE = 512;
/** Maior arquivo aceito na escolha (antes de reduzir). */
export const PHOTO_MAX_INPUT_BYTES = 12 * 1024 * 1024;
/** Escolha: qualquer imagem que o navegador consiga abrir (ela sai em WEBP ou JPEG). */
export const PHOTO_ACCEPT = 'image/*';

const MESSAGES: Record<string, string> = {
  nao_autorizado: 'Você não tem permissão para trocar esta foto.',
  foto_invalida: 'Não foi possível validar a foto. Tente enviar de novo.',
};

export function photoError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) return MESSAGES[code];
  if (/bucket not found/i.test(msg)) return 'O espaço de fotos ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/exceeded the maximum allowed size|too large/i.test(msg)) return 'A foto ficou grande demais. Tente outra imagem.';
  if (/mime type|invalid_mime/i.test(msg)) return 'Use uma imagem PNG, JPG ou WEBP.';
  if (/row-level security|permission/i.test(msg)) return 'Sem permissão para trocar esta foto (modo somente leitura?).';
  return `Erro ao salvar a foto: ${msg}`;
}

/** Confere a imagem escolhida, antes de abrir o ajuste. */
export function checkPhotoFile(file: File): string | null {
  // Tipo vazio acontece (ex.: HEIC em alguns aparelhos): quem decide é o navegador ao abrir
  if (file.type && !file.type.startsWith('image/')) return 'Escolha um arquivo de imagem.';
  if (file.size > PHOTO_MAX_INPUT_BYTES) return 'A foto original pode ter no máximo 12 MB.';
  return null;
}

/** Iniciais para o avatar quando o atleta/treinador ainda não tem foto. */
export function photoInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Caminho do arquivo dentro do bucket "fotos" a partir do endereço público. */
export function photoPathFromUrl(url: string | null | undefined, clubId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split(/[?#]/)[0];
  if (!path.startsWith(`${clubId}/`)) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation evita foto de celular deitada
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Navegador sem suporte à opção: tenta pelo <img>
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível ler a imagem. Tente outra foto (JPG ou PNG).'));
      img.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** WEBP quando o navegador sabe gerar (o Safari não sabe: devolve PNG); senão JPEG. */
export async function encodePhoto(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', 0.85);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.86);
  if (!jpeg) throw new Error('Não foi possível preparar a imagem.');
  return jpeg;
}

const extOf = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

/**
 * Foto pronta para subir: quadrada, 512 px, WEBP/JPEG. A que sai do ajuste (PhotoCropDialog)
 * já está assim e vai como está; outra imagem é recortada no centro e reduzida.
 */
async function preparePhoto(file: Blob): Promise<{ blob: Blob; ext: string }> {
  const decoded = await decodeImage(file);
  try {
    const ready = decoded.width === PHOTO_SIZE && decoded.height === PHOTO_SIZE && (file.type === 'image/webp' || file.type === 'image/jpeg');
    if (ready) return { blob: file, ext: extOf(file.type) };

    const side = Math.max(1, Math.min(PHOTO_SIZE, Math.round(Math.min(decoded.width, decoded.height))));
    const sourceSide = Math.min(decoded.width, decoded.height);
    const sx = (decoded.width - sourceSide) / 2;
    const sy = (decoded.height - sourceSide) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar a imagem.');
    // Fundo claro: se o navegador cair para JPEG, áreas transparentes não viram preto
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, side, side);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, sx, sy, sourceSide, sourceSide, 0, 0, side, side);

    const blob = await encodePhoto(canvas);
    return { blob, ext: extOf(blob.type) };
  } finally {
    decoded.close();
  }
}

export type PhotoKind = 'athlete' | 'coach';

const folderOf = (kind: PhotoKind) => (kind === 'athlete' ? 'atletas' : 'treinadores');
const rpcOf = (kind: PhotoKind) => (kind === 'athlete' ? 'club_set_athlete_photo' : 'club_set_coach_photo');
const idArgOf = (kind: PhotoKind, id: string) =>
  kind === 'athlete' ? { p_athlete_id: id } : { p_user_id: id };

/** Apaga os arquivos da pasta da pessoa, menos `keep` (sobras de trocas anteriores). */
async function clearFolder(folder: string, keep?: string): Promise<void> {
  const { data } = await supabase!.storage.from(PHOTO_BUCKET).list(folder, { limit: 100 });
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== keep);
  if (paths.length) await supabase!.storage.from(PHOTO_BUCKET).remove(paths);
}

/**
 * Comissão técnica: envia a foto de um atleta ou treinador do clube e grava o endereço
 * no banco. Depois apaga as fotos anteriores da pasta (mantém o bucket leve).
 */
export async function uploadPhoto(kind: PhotoKind, id: string, clubId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const problem = checkPhotoFile(file);
  if (problem) throw new Error(problem);

  const { blob, ext } = await preparePhoto(file);
  const folder = `${clubId}/${folderOf(kind)}/${id}`;
  const path = `${folder}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadError) throw new Error(photoError(uploadError));

  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: dbError } = await supabase.rpc(rpcOf(kind), { ...idArgOf(kind, id), p_url: url });
  if (dbError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
    throw new Error(photoError(dbError));
  }

  await clearFolder(folder, path).catch(() => undefined);
  return url;
}

/** Comissão técnica: remove a foto do atleta/treinador (banco e Storage). */
export async function removePhoto(kind: PhotoKind, id: string, clubId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc(rpcOf(kind), { ...idArgOf(kind, id), p_url: null });
  if (error) throw new Error(photoError(error));
  await clearFolder(`${clubId}/${folderOf(kind)}/${id}`).catch(() => undefined);
}

/** Atleta excluído: apaga os arquivos de foto dele (o cadastro já saiu do banco). */
export async function removePhotoFolder(kind: PhotoKind, id: string, clubId: string): Promise<void> {
  if (!supabase) return;
  await clearFolder(`${clubId}/${folderOf(kind)}/${id}`);
}

/**
 * Foto do próprio atleta (ele não usa o Supabase Auth). Vai para a Edge Function
 * "foto-atleta", que confere a sessão e descobre a pasta dele no banco; o navegador
 * não escolhe o atleta nem o clube.
 */
export async function uploadOwnAthletePhoto(token: string, file: File): Promise<string> {
  const problem = checkPhotoFile(file);
  if (problem) throw new Error(problem);
  const { blob } = await preparePhoto(file);
  return sendAthletePhoto(token, blob);
}
