// Figurinha do treino por cima da foto pós-treino (Story 1080 × 1920): nome do treino,
// horário, duração, a PSE do atleta e a esperada pelo treinador. Foto e figurinha são
// montadas no próprio celular e só saem dele se o atleta escolher onde postar.
// Baixado só na hora de compartilhar (import dinâmico), junto com storyCard.ts.
import { PSE_SCALE } from '../data/constants';
import {
  STORY_H,
  STORY_W,
  StoryColors,
  canvasToBlob,
  containImage,
  fitFont,
  loadImage,
  readStoryColors,
  rgba,
  roundRect,
  setFont,
  sizeOf,
} from './storyCard';

export interface TrainingStickerData {
  /** Nome do treino (ou o tipo, quando não tem nome) */
  titulo: string;
  tipo?: string | null;
  /** "18:00–19:30" (programado) ou a hora do envio */
  horario?: string | null;
  minutos?: number | null;
  pse: number;
  /** PSE esperada pelo treinador (1 a 10) */
  esperada?: number | null;
}

export interface StickerStyle {
  estilo: 'escuro' | 'claro';
  /** Mostrar a PSE do atleta e a esperada (dá para esconder antes de postar) */
  notas: boolean;
}

export interface StickerAssets {
  escudo?: CanvasImageSource | null;
  logo?: CanvasImageSource | null;
}

/** Posição da foto e da figurinha no Story */
export interface PostLayout {
  /** Enquadramento da foto, como o object-position do CSS: 0 = encostada à esquerda/topo, 100 = à direita/embaixo */
  fotoX: number;
  fotoY: number;
  /** Centro da figurinha (0 a 1 da largura e da altura do Story) */
  cx: number;
  cy: number;
  /** Largura da figurinha (fração da largura do Story) */
  largura: number;
}

export const STICKER_W = 900;
const P = 48;
const HEADER_H = 206;
const NOTES_H = 300;
const DONE_H = 150;
const FOOTER_H = 84;

const clampPse = (v: number) => Math.min(10, Math.max(1, Math.round(v)));

export function stickerHeight(style: StickerStyle): number {
  return P + HEADER_H + (style.notas ? NOTES_H : DONE_H) + FOOTER_H;
}

/** Foto cobrindo o quadro inteiro (como object-fit: cover), no enquadramento escolhido */
export function coverRect(iw: number, ih: number, fw: number, fh: number, posX: number, posY: number) {
  const s = Math.max(fw / iw, fh / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: ((fw - w) * posX) / 100, y: ((fh - h) * posY) / 100, w, h };
}

/** Mantém a figurinha inteira dentro do Story. `aspect` = altura/largura da figurinha. */
export function clampSticker(cx: number, cy: number, largura: number, aspect: number): { cx: number; cy: number } {
  const halfW = largura / 2;
  const halfH = (largura * aspect * STORY_W) / STORY_H / 2;
  return {
    cx: Math.min(1 - halfW, Math.max(halfW, cx)),
    cy: Math.min(1 - halfH, Math.max(halfH, cy)),
  };
}

/** Desenha a figurinha na origem do ctx (STICKER_W × stickerHeight). Fundo dos cantos fica transparente. */
export function drawTrainingSticker(
  ctx: CanvasRenderingContext2D,
  info: TrainingStickerData,
  style: StickerStyle,
  assets: StickerAssets,
  colors: StoryColors,
  brand: string
) {
  const W = STICKER_W;
  const H = stickerHeight(style);
  const dark = style.estilo === 'escuro';
  const text = dark ? '#ffffff' : '#0f172a';
  const muted = dark ? colors.muted : '#475569';

  roundRect(ctx, 2, 2, W - 4, H - 4, 52);
  ctx.fillStyle = dark ? rgba(colors.base, 0.84) : rgba('#ffffff', 0.95);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = rgba(colors.accent, dark ? 0.6 : 0.7);
  ctx.stroke();

  // Cabeçalho: escudo, "TREINO DE HOJE", nome e horário
  let y = P;
  let tx = P;
  if (assets.escudo) {
    containImage(ctx, assets.escudo, P, y + 6, 96, 110);
    tx = P + 124;
  }
  const tw = W - P - tx;
  setFont(ctx, 26, 900);
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? colors.accentSoft : colors.accent;
  ctx.fillText('TREINO DE HOJE', tx, y + 30);
  fitFont(ctx, info.titulo, tw, 60, 34, 900);
  ctx.fillStyle = text;
  ctx.fillText(info.titulo, tx, y + 98);
  const sub = [info.horario, info.minutos ? `${info.minutos} min` : null, info.tipo && info.tipo !== info.titulo ? info.tipo : null]
    .filter(Boolean)
    .join(' · ');
  if (sub) {
    fitFont(ctx, sub, tw, 32, 22, 600);
    ctx.fillStyle = muted;
    ctx.fillText(sub, tx, y + 146);
  }
  y += HEADER_H;
  ctx.fillStyle = rgba(text, 0.14);
  ctx.fillRect(P, y - 26, W - 2 * P, 3);

  if (style.notas) {
    const pse = clampPse(info.pse);
    const scale = PSE_SCALE[pse];
    const esperada = info.esperada ? clampPse(info.esperada) : null;

    setFont(ctx, 26, 800);
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText('MINHA PSE', P, y + 30);
    setFont(ctx, 150, 900);
    ctx.fillStyle = scale.color;
    ctx.fillText(String(pse), P - 6, y + 176);
    const nw = ctx.measureText(String(pse)).width;
    const lx = P + nw + 22;
    const lw = (esperada ? W - P - 220 : W - P) - lx;
    fitFont(ctx, scale.text, lw, 40, 24, 900);
    ctx.fillStyle = scale.color;
    ctx.fillText(scale.text, lx, y + 112);
    setFont(ctx, 28, 600);
    ctx.fillStyle = muted;
    ctx.fillText('de 10', lx, y + 158);

    if (esperada) {
      ctx.textAlign = 'right';
      setFont(ctx, 26, 800);
      ctx.fillStyle = muted;
      ctx.fillText('ESPERADA', W - P, y + 30);
      setFont(ctx, 110, 900);
      ctx.fillStyle = rgba(text, 0.9);
      ctx.fillText(String(esperada), W - P, y + 150);
      ctx.textAlign = 'left';
    }

    // Régua de 1 a 10: pintada até a PSE do atleta; a esperada fica contornada
    const by = y + 206;
    const gap = 8;
    const sw = (W - 2 * P - 9 * gap) / 10;
    for (let i = 1; i <= 10; i++) {
      const sx = P + (i - 1) * (sw + gap);
      roundRect(ctx, sx, by, sw, 26, 8);
      ctx.fillStyle = i <= pse ? PSE_SCALE[i].color : rgba(text, 0.13);
      ctx.fill();
      if (i === esperada) {
        roundRect(ctx, sx - 5, by - 5, sw + 10, 36, 11);
        ctx.lineWidth = 4;
        ctx.strokeStyle = text;
        ctx.stroke();
      }
    }
    setFont(ctx, 22, 700);
    ctx.fillStyle = muted;
    // "esperada" embaixo do quadradinho contornado (as pontas 1 e 10 saem se ficarem embaixo dele)
    if (!esperada || esperada > 2) ctx.fillText('1', P, by + 62);
    ctx.textAlign = 'right';
    if (!esperada || esperada < 9) ctx.fillText('10', W - P, by + 62);
    if (esperada) {
      ctx.textAlign = 'center';
      ctx.fillStyle = text;
      ctx.fillText('esperada', P + (esperada - 1) * (sw + gap) + sw / 2, by + 62);
    }
    ctx.textAlign = 'left';
    y += NOTES_H;
  } else {
    // Sinal de "certo" desenhado (o caractere ✓ falta em algumas fontes)
    const r = 30;
    const ccx = P + r;
    const ccy = y + 44;
    ctx.beginPath();
    ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ccx - 13, ccy + 1);
    ctx.lineTo(ccx - 4, ccy + 11);
    ctx.lineTo(ccx + 14, ccy - 10);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
    setFont(ctx, 52, 900);
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText('Treino concluído', P + 2 * r + 22, y + 62);
    if (info.minutos) {
      setFont(ctx, 32, 600);
      ctx.fillStyle = muted;
      ctx.fillText(`${info.minutos} minutos de treino`, P, y + 112);
    }
    y += DONE_H;
  }

  // Rodapé: marca da plataforma
  drawFooter(ctx, y, text, muted, assets, brand);
}

// ---------- Figurinha da medalha (foto com a medalha depois da competição) ----------

/** Resultado da competição (mesmos dados do cartão de Stories "resultado"). */
export interface MedalStickerData {
  kind: 'resultado';
  nome: string;
  data: string;
  local?: string | null;
  categoria?: string | null;
  colocacao: 1 | 2 | 3 | 5 | 7;
  lutas?: number | null;
  vitorias?: number | null;
  derrotas?: number | null;
}

/** O que vai por cima da foto: o treino (PSE) ou a medalha da competição */
export type PhotoStickerInfo = TrainingStickerData | MedalStickerData;

export const isMedalSticker = (info: PhotoStickerInfo): info is MedalStickerData => 'kind' in info && info.kind === 'resultado';

/** A medalha tem lutas/vitórias para mostrar ou esconder? */
export const medalHasFights = (info: MedalStickerData) => info.lutas !== null && info.lutas !== undefined;

const MEDAL_H = 300;
const MEDAL_COLOR: Record<MedalStickerData['colocacao'], string> = { 1: '#facc15', 2: '#e2e8f0', 3: '#d97706', 5: '#38bdf8', 7: '#38bdf8' };
const MEDAL_TITLE: Record<MedalStickerData['colocacao'], string> = { 1: 'CAMPEÃO', 2: 'VICE-CAMPEÃO', 3: '3º LUGAR', 5: '5º LUGAR', 7: '7º LUGAR' };

export function medalStickerHeight(): number {
  return P + HEADER_H + MEDAL_H + FOOTER_H;
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Rodapé com o ícone e o nome da plataforma (igual nas duas figurinhas) */
function drawFooter(ctx: CanvasRenderingContext2D, y: number, text: string, muted: string, assets: StickerAssets, brand: string) {
  ctx.fillStyle = rgba(text, 0.14);
  ctx.fillRect(P, y - 10, STICKER_W - 2 * P, 3);
  let fx = P;
  if (assets.logo) {
    ctx.save();
    roundRect(ctx, P, y + 14, 40, 40, 10);
    ctx.clip();
    ctx.drawImage(assets.logo, P, y + 14, 40, 40);
    ctx.restore();
    fx += 54;
  }
  setFont(ctx, 26, 700);
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText(`feito com ${brand}`, fx, y + 44);
}

/** Desenha a figurinha da medalha na origem do ctx (STICKER_W × medalStickerHeight). */
export function drawMedalSticker(
  ctx: CanvasRenderingContext2D,
  info: MedalStickerData,
  style: StickerStyle,
  assets: StickerAssets,
  colors: StoryColors,
  brand: string
) {
  const W = STICKER_W;
  const H = medalStickerHeight();
  const dark = style.estilo === 'escuro';
  const text = dark ? '#ffffff' : '#0f172a';
  const muted = dark ? colors.muted : '#475569';
  const medal = MEDAL_COLOR[info.colocacao];
  const podio = info.colocacao <= 3;

  roundRect(ctx, 2, 2, W - 4, H - 4, 52);
  ctx.fillStyle = dark ? rgba(colors.base, 0.84) : rgba('#ffffff', 0.95);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = rgba(medal, dark ? 0.75 : 0.9);
  ctx.stroke();

  // Cabeçalho: escudo, "PÓDIO"/"RESULTADO", nome da competição, data e local
  let y = P;
  let tx = P;
  if (assets.escudo) {
    containImage(ctx, assets.escudo, P, y + 6, 96, 110);
    tx = P + 124;
  }
  const tw = W - P - tx;
  setFont(ctx, 26, 900);
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? colors.accentSoft : colors.accent;
  ctx.fillText(podio ? 'PÓDIO' : 'RESULTADO', tx, y + 30);
  fitFont(ctx, info.nome, tw, 56, 32, 900);
  ctx.fillStyle = text;
  ctx.fillText(info.nome, tx, y + 96);
  const sub = [brDate(info.data), info.local].filter(Boolean).join(' · ');
  fitFont(ctx, sub, tw, 32, 22, 600);
  ctx.fillStyle = muted;
  ctx.fillText(sub, tx, y + 146);
  y += HEADER_H;
  ctx.fillStyle = rgba(text, 0.14);
  ctx.fillRect(P, y - 26, W - 2 * P, 3);

  // Medalha: fita em V e o disco com a colocação
  const r = 104;
  const mx = P + r + 6;
  const my = y + 150;
  ctx.fillStyle = rgba(colors.accent, 0.9);
  ctx.beginPath();
  ctx.moveTo(mx - 78, y - 6);
  ctx.lineTo(mx - 30, y - 6);
  ctx.lineTo(mx + 6, my - r + 20);
  ctx.lineTo(mx - 34, my - r + 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(colors.accent, 0.65);
  ctx.beginPath();
  ctx.moveTo(mx + 78, y - 6);
  ctx.lineTo(mx + 30, y - 6);
  ctx.lineTo(mx - 6, my - r + 20);
  ctx.lineTo(mx + 34, my - r + 26);
  ctx.closePath();
  ctx.fill();
  const grad = ctx.createRadialGradient(mx - 30, my - 34, 10, mx, my, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, medal);
  grad.addColorStop(1, rgba(medal, 0.75));
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = rgba('#000000', 0.18);
  ctx.beginPath();
  ctx.arc(mx, my, r - 16, 0, Math.PI * 2);
  ctx.stroke();
  setFont(ctx, 96, 900);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${info.colocacao}º`, mx + 4, my + 34);

  // Título, categoria e lutas
  const rx = mx + r + 40;
  const rw = W - P - rx;
  ctx.textAlign = 'left';
  fitFont(ctx, MEDAL_TITLE[info.colocacao], rw, 70, 34, 900);
  ctx.fillStyle = dark || info.colocacao !== 2 ? medal : '#64748b';
  ctx.fillText(MEDAL_TITLE[info.colocacao], rx, y + 118);
  if (info.categoria) {
    fitFont(ctx, `Categoria ${info.categoria}`, rw, 34, 22, 700);
    ctx.fillStyle = text;
    ctx.fillText(`Categoria ${info.categoria}`, rx, y + 172);
  }
  if (style.notas && medalHasFights(info)) {
    const lutas = info.lutas ?? 0;
    const fights = `${lutas} luta${lutas === 1 ? '' : 's'} · ${info.vitorias ?? 0}V · ${info.derrotas ?? 0}D`;
    fitFont(ctx, fights, rw, 32, 20, 600);
    ctx.fillStyle = muted;
    ctx.fillText(fights, rx, y + 220);
  }
  y += MEDAL_H;

  drawFooter(ctx, y, text, muted, assets, brand);
}

/** Desenha o Story final: foto cobrindo a tela e a figurinha por cima, com sombra suave. */
export function drawTrainingPost(ctx: CanvasRenderingContext2D, photo: CanvasImageSource, sticker: CanvasImageSource, stickerAspect: number, layout: PostLayout) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const [iw, ih] = sizeOf(photo);
  const r = coverRect(iw, ih, STORY_W, STORY_H, layout.fotoX, layout.fotoY);
  ctx.drawImage(photo, r.x, r.y, r.w, r.h);
  const w = layout.largura * STORY_W;
  const h = w * stickerAspect;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.drawImage(sticker, layout.cx * STORY_W - w / 2, layout.cy * STORY_H - h / 2, w, h);
  ctx.restore();
}

// ---------- No navegador ----------

/** Escudo do clube e ícone do app (o que não carregar fica de fora) */
export async function loadStickerAssets(escudo?: string | null): Promise<StickerAssets> {
  const [e, logo] = await Promise.all([loadImage(escudo), loadImage('/icons/icon-192.png')]);
  return { escudo: e, logo };
}

export function renderSticker(info: PhotoStickerInfo, style: StickerStyle, assets: StickerAssets, brand: string): HTMLCanvasElement {
  const medal = isMedalSticker(info);
  const canvas = document.createElement('canvas');
  canvas.width = STICKER_W;
  canvas.height = medal ? medalStickerHeight() : stickerHeight(style);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível montar a figurinha.');
  if (medal) drawMedalSticker(ctx, info, style, assets, readStoryColors(), brand);
  else drawTrainingSticker(ctx, info, style, assets, readStoryColors(), brand);
  return canvas;
}

/** Story final em JPEG (foto + figurinha) */
export function renderTrainingPost(photo: CanvasImageSource, sticker: HTMLCanvasElement, layout: PostLayout): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível montar a imagem.');
  drawTrainingPost(ctx, photo, sticker, sticker.height / sticker.width, layout);
  return canvasToBlob(canvas, 'image/jpeg', 0.9);
}
