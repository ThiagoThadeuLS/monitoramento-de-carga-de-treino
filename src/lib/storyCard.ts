// Cartão para Stories (1080 × 1920) feito no próprio celular: foto do atleta, escudo do
// clube, o destaque (recorde, sequência, resumo, competição ou selo) e a marca da
// plataforma no rodapé. A imagem só sai do aparelho se o atleta escolher onde postar.
// Este arquivo é baixado só na hora de compartilhar (import dinâmico).
import type { Badge, PeriodSummary } from './achievements';
import type { CompetitionPlacement } from './competitionResults';
import { todayISO } from './date';

export type StoryCard =
  | { kind: 'pr'; exercicio: string; peso: number; /** null = recorde atual (sem comparação) */ ganho: number | null }
  | { kind: 'sequencia'; dias: number }
  | { kind: 'resumo'; resumo: PeriodSummary }
  | { kind: 'competicao'; nome: string; data: string; dias: number; local?: string | null; categoria?: string | null }
  | {
      kind: 'resultado';
      nome: string;
      data: string;
      local?: string | null;
      categoria?: string | null;
      colocacao: CompetitionPlacement;
      lutas?: number | null;
      vitorias?: number | null;
      derrotas?: number | null;
    }
  | { kind: 'selo'; selo: Pick<Badge, 'emoji' | 'title' | 'description' | 'unlockedAt'> };

export interface StoryPerson {
  nome: string;
  foto?: string | null;
  categoria?: string | null;
  classe?: string | null;
  clube?: string | null;
  escudo?: string | null;
}

export interface StoryColors {
  accent: string;
  accentSoft: string;
  base: string;
  panel: string;
  muted: string;
}

export interface StoryAssets {
  foto?: CanvasImageSource | null;
  escudo?: CanvasImageSource | null;
  logo?: CanvasImageSource | null;
}

export const STORY_W = 1080;
export const STORY_H = 1920;
const M = 90; // margem lateral
const CW = STORY_W - 2 * M;
// O topo (~180 px) e a base (~220 px) ficam livres: o Instagram põe barra e botões ali
const HERO_TOP = 340;
const HERO_BOTTOM = 1290;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const WHITE = '#ffffff';

export const DEFAULT_STORY_COLORS: StoryColors = {
  accent: '#0ea5e9',
  accentSoft: '#7dd3fc',
  base: '#020617',
  panel: '#0f172a',
  muted: '#94a3b8',
};

type Ctx = CanvasRenderingContext2D;

const kg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "Maria Clara de Souza" -> "Maria Souza" (cabe no cartão) */
export function shortName(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' ') : `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Categoria "-73" vira "-73 kg" */
export function categoryLabel(c?: string | null): string {
  const t = (c ?? '').trim();
  return /^[-+]?\d+([.,]\d+)?$/.test(t) ? `${t} kg` : t;
}

const initials = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
};

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function setFont(ctx: Ctx, size: number, weight = 800, family = FONT) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
}

/** Maior tamanho (até `size`) em que o texto cabe na largura */
export function fitFont(ctx: Ctx, text: string, maxW: number, size: number, min: number, weight = 800): number {
  let s = size;
  setFont(ctx, s, weight);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    setFont(ctx, s, weight);
  }
  return s;
}

/** Quebra em linhas que cabem na largura; se sobrar, a última termina com "…" */
function wrap(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.trim().split(/\s+/)) {
    const test = line ? `${line} ${w}` : w;
    if (!line || ctx.measureText(test).width <= maxW) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function sizeOf(img: CanvasImageSource): [number, number] {
  const i = img as { naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  const w = i.naturalWidth || (typeof i.width === 'number' ? i.width : 0) || 1;
  const h = i.naturalHeight || (typeof i.height === 'number' ? i.height : 0) || 1;
  return [w, h];
}

export function containImage(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const [iw, ih] = sizeOf(img);
  const s = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

function circleImage(ctx: Ctx, img: CanvasImageSource, cx: number, cy: number, r: number) {
  const [iw, ih] = sizeOf(img);
  const side = Math.min(iw, ih);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
}

// ---------- Linhas do destaque (empilhadas e centralizadas no meio do cartão) ----------

interface Row {
  h: number;
  draw: (top: number) => void;
}

function stack(rows: Row[], top: number, bottom: number) {
  const total = rows.reduce((s, r) => s + r.h, 0);
  let y = top + Math.max(0, (bottom - top - total) / 2);
  for (const r of rows) {
    r.draw(y);
    y += r.h;
  }
}

const spacer = (h: number): Row => ({ h, draw: () => undefined });

function textRow(ctx: Ctx, text: string, size: number, weight: number, color: string, maxLines = 1, min = size * 0.6): Row {
  let s = size;
  let lines: string[];
  if (maxLines === 1) {
    s = fitFont(ctx, text, CW, size, min, weight);
    lines = [text];
  } else {
    setFont(ctx, s, weight);
    lines = wrap(ctx, text, CW, maxLines);
  }
  const lh = s * 1.16;
  return {
    h: lines.length * lh,
    draw: (top) => {
      setFont(ctx, s, weight);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, STORY_W / 2, top + lh * (i + 1) - s * 0.24));
    },
  };
}

function pillRow(ctx: Ctx, text: string, bg: string, fg: string, size = 34): Row {
  const h = size * 1.9;
  return {
    h: h + 8,
    draw: (top) => {
      setFont(ctx, size, 900);
      const w = ctx.measureText(text).width + size * 1.5;
      roundRect(ctx, (STORY_W - w) / 2, top, w, h, h / 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, STORY_W / 2, top + h / 2 + 2);
      ctx.textBaseline = 'alphabetic';
    },
  };
}

function emojiRow(ctx: Ctx, emoji: string, size: number): Row {
  return {
    h: size * 1.15,
    draw: (top) => {
      ctx.font = `${size}px ${EMOJI}`;
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(emoji, STORY_W / 2, top + size * 0.95);
    },
  };
}

/** Número grande com unidade ao lado (ex.: "140" + "kg"), encolhe até caber */
function numberRow(ctx: Ctx, value: string, unit: string, size: number, colors: StoryColors): Row {
  let s = size;
  const widths = (sz: number) => {
    setFont(ctx, sz, 900);
    const vw = ctx.measureText(value).width;
    setFont(ctx, sz * 0.34, 800);
    const uw = unit ? ctx.measureText(unit).width + sz * 0.08 : 0;
    return [vw, uw];
  };
  while (s > 120 && widths(s)[0] + widths(s)[1] > CW) s -= 8;
  const [vw, uw] = widths(s);
  // Folga em cima e embaixo: os algarismos não encostam no texto vizinho
  return {
    h: s * 1.02,
    draw: (top) => {
      const x0 = (STORY_W - vw - uw) / 2;
      const baseline = top + s * 0.88;
      ctx.textAlign = 'left';
      setFont(ctx, s, 900);
      ctx.fillStyle = WHITE;
      ctx.fillText(value, x0, baseline);
      if (unit) {
        setFont(ctx, s * 0.34, 800);
        ctx.fillStyle = colors.accentSoft;
        ctx.fillText(unit, x0 + vw + s * 0.08, baseline);
      }
    },
  };
}

interface Stat {
  value: string;
  label: string;
  /** Texto em vez de número (letra menor) */
  text?: boolean;
}

function gridRow(ctx: Ctx, stats: Stat[], colors: StoryColors): Row {
  const gap = 28;
  const bw = (CW - gap) / 2;
  const bh = 236;
  const rows = Math.ceil(stats.length / 2);
  return {
    h: rows * bh + (rows - 1) * gap,
    draw: (top) => {
      stats.forEach((st, i) => {
        const x = M + (i % 2) * (bw + gap);
        const y = top + Math.floor(i / 2) * (bh + gap);
        roundRect(ctx, x, y, bw, bh, 40);
        ctx.fillStyle = rgba(colors.panel, 0.85);
        ctx.fill();
        ctx.strokeStyle = rgba(colors.accent, 0.3);
        ctx.lineWidth = 3;
        ctx.stroke();
        const s = fitFont(ctx, st.value, bw - 50, st.text ? 64 : 112, 36, 900);
        ctx.fillStyle = st.text ? colors.accentSoft : WHITE;
        ctx.textAlign = 'center';
        ctx.fillText(st.value, x + bw / 2, y + 112 + (st.text ? 0 : s * 0.12));
        setFont(ctx, 34, 600);
        ctx.fillStyle = colors.muted;
        ctx.fillText(st.label, x + bw / 2, y + 190);
      });
    },
  };
}

function medalRow(ctx: Ctx, emoji: string, colors: StoryColors, radius = 170): Row {
  const r = radius;
  return {
    h: 2 * r + 40,
    draw: (top) => {
      const cy = top + r + 20;
      const glow = ctx.createRadialGradient(STORY_W / 2, cy, r * 0.6, STORY_W / 2, cy, r * 1.7);
      glow.addColorStop(0, rgba(colors.accent, 0.45));
      glow.addColorStop(1, rgba(colors.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(STORY_W / 2 - r * 1.8, cy - r * 1.8, r * 3.6, r * 3.6);
      ctx.beginPath();
      ctx.arc(STORY_W / 2, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.panel;
      ctx.fill();
      ctx.lineWidth = 16;
      ctx.strokeStyle = colors.accent;
      ctx.stroke();
      ctx.font = `${r}px ${EMOJI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = WHITE;
      ctx.fillText(emoji, STORY_W / 2, cy + 8);
      ctx.textBaseline = 'alphabetic';
    },
  };
}

const shortType = (t: string) => t.replace(/^treino\s+/i, '');

function heroRows(ctx: Ctx, card: StoryCard, c: StoryColors): Row[] {
  const label = (t: string) => pillRow(ctx, t, c.accent, c.base);
  switch (card.kind) {
    case 'pr': {
      const novo = card.ganho !== null && card.ganho > 0;
      return [
        label(novo ? 'NOVO RECORDE' : 'MEU RECORDE'),
        spacer(46),
        textRow(ctx, card.exercicio, 92, 900, WHITE, 2),
        spacer(24),
        numberRow(ctx, kg(card.peso), 'kg', 330, c),
        spacer(34),
        novo
          ? pillRow(ctx, `+${kg(card.ganho!)} kg no recorde`, rgba(c.accent, 0.2), c.accentSoft, 40)
          : textRow(ctx, 'Carga máxima para 1 repetição', 40, 600, c.muted),
      ];
    }
    case 'sequencia':
      return [
        label('SEQUÊNCIA'),
        spacer(36),
        emojiRow(ctx, '🔥', 170),
        numberRow(ctx, String(card.dias), '', 380, c),
        textRow(ctx, card.dias === 1 ? 'DIA SEGUIDO' : 'DIAS SEGUIDOS', 84, 900, WHITE),
        spacer(18),
        textRow(ctx, 'respondendo o monitoramento do treino', 40, 600, c.muted, 2),
      ];
    case 'resumo': {
      const r = card.resumo;
      const fourth: Stat =
        r.prs > 0
          ? { value: String(r.prs), label: r.prs === 1 ? 'PR novo' : 'PRs novos' }
          : r.tipoPrincipal
          ? { value: shortType(r.tipoPrincipal.tipo), label: 'o que mais treinou', text: true }
          : { value: '0', label: 'PRs novos' };
      const highlight =
        r.periodo === 'mes'
          ? r.semanaForte
            ? `Semana mais forte: ${dm(r.semanaForte.from)} a ${dm(r.semanaForte.to)} · ${r.semanaForte.minutos} min`
            : ''
          : r.variacaoMinutos
          ? `${r.variacaoMinutos > 0 ? '+' : ''}${r.variacaoMinutos}% de minutos que na semana anterior`
          : '';
      return [
        label(r.periodo === 'semana' ? 'MINHA SEMANA' : 'MEU MÊS'),
        spacer(26),
        textRow(ctx, r.titulo, 62, 900, WHITE),
        spacer(40),
        gridRow(
          ctx,
          [
            { value: String(r.treinos), label: r.treinos === 1 ? 'treino' : 'treinos' },
            { value: r.minutos.toLocaleString('pt-BR'), label: 'minutos de treino' },
            { value: String(r.dias), label: r.dias === 1 ? 'dia respondido' : 'dias respondidos' },
            fourth,
          ],
          c
        ),
        ...(highlight ? [spacer(40), textRow(ctx, highlight, 40, 700, c.accentSoft, 2)] : []),
      ];
    }
    case 'competicao': {
      const meta = [br(card.data), card.local].filter(Boolean).join(' · ');
      const cat = categoryLabel(card.categoria);
      const tail: Row[] = [
        spacer(30),
        textRow(ctx, card.nome, 60, 900, WHITE, 2),
        spacer(8),
        textRow(ctx, meta, 36, 600, c.muted, 2),
        ...(cat ? [spacer(22), pillRow(ctx, `Categoria ${cat}`, rgba(c.accent, 0.2), c.accentSoft, 34)] : []),
      ];
      if (card.dias <= 0) return [label('É HOJE'), spacer(30), emojiRow(ctx, '🥋', 200), ...tail];
      return [
        label('CONTAGEM REGRESSIVA'),
        spacer(24),
        textRow(ctx, card.dias === 1 ? 'FALTA' : 'FALTAM', 56, 800, c.muted),
        numberRow(ctx, String(card.dias), '', 300, c),
        textRow(ctx, card.dias === 1 ? 'DIA' : 'DIAS', 76, 900, c.accentSoft),
        ...tail,
      ];
    }
    case 'resultado': {
      const emoji = card.colocacao === 1 ? '🥇' : card.colocacao === 2 ? '🥈' : card.colocacao === 3 ? '🥉' : '🏅';
      const title =
        card.colocacao === 1 ? 'CAMPEÃO' : card.colocacao === 2 ? 'VICE-CAMPEÃO' : `${card.colocacao}º LUGAR`;
      const meta = [br(card.data), card.local].filter(Boolean).join(' · ');
      const cat = categoryLabel(card.categoria);
      const fights =
        card.lutas !== null && card.lutas !== undefined
          ? `${card.lutas} luta${card.lutas === 1 ? '' : 's'}` +
            (card.vitorias !== null && card.vitorias !== undefined
              ? ` • ${card.vitorias} vitória${card.vitorias === 1 ? '' : 's'}`
              : '') +
            (card.derrotas !== null && card.derrotas !== undefined
              ? ` • ${card.derrotas} derrota${card.derrotas === 1 ? '' : 's'}`
              : '')
          : '';
      return [
        label('MEU RESULTADO'),
        spacer(20),
        medalRow(ctx, emoji, c, 145),
        spacer(16),
        textRow(ctx, title, 92, 900, WHITE),
        spacer(16),
        textRow(ctx, card.nome, 58, 900, WHITE, 2),
        spacer(8),
        textRow(ctx, meta, 36, 600, c.muted, 2),
        ...(cat ? [spacer(16), pillRow(ctx, `Categoria ${cat}`, rgba(c.accent, 0.2), c.accentSoft, 34)] : []),
        ...(fights ? [spacer(14), textRow(ctx, fights, 36, 700, c.accentSoft, 2)] : []),
      ];
    }
    case 'selo':
      return [
        label('NOVA CONQUISTA'),
        spacer(36),
        medalRow(ctx, card.selo.emoji, c),
        spacer(30),
        textRow(ctx, card.selo.title, 86, 900, WHITE, 2),
        spacer(14),
        textRow(ctx, card.selo.description, 42, 600, c.muted, 3),
        ...(card.selo.unlockedAt ? [spacer(22), textRow(ctx, `Conquistado em ${br(card.selo.unlockedAt)}`, 36, 700, c.accentSoft)] : []),
      ];
  }
}

/** Desenha o cartão inteiro (sem rede nem tela: recebe as imagens já carregadas). */
export function drawStory(
  ctx: Ctx,
  card: StoryCard,
  person: StoryPerson,
  assets: StoryAssets,
  colors: StoryColors,
  brand: string,
  today: string
) {
  const c = colors;

  // Fundo: cor do clube com brilhos da cor principal
  ctx.fillStyle = c.base;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const g1 = ctx.createRadialGradient(STORY_W * 0.85, 420, 40, STORY_W * 0.85, 420, 980);
  g1.addColorStop(0, rgba(c.accent, 0.5));
  g1.addColorStop(1, rgba(c.accent, 0));
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const g2 = ctx.createRadialGradient(STORY_W * 0.1, STORY_H * 0.82, 40, STORY_W * 0.1, STORY_H * 0.82, 820);
  g2.addColorStop(0, rgba(c.accent, 0.26));
  g2.addColorStop(1, rgba(c.accent, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.lineWidth = 44;
  ctx.strokeStyle = rgba(c.accent, 0.09);
  ctx.beginPath();
  ctx.arc(STORY_W * 0.95, 260, 360, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(STORY_W * 0.05, STORY_H * 0.9, 300, 0, Math.PI * 2);
  ctx.stroke();

  // Cabeçalho: escudo, clube e data
  const headerY = 190;
  let tx = M;
  if (assets.escudo) {
    containImage(ctx, assets.escudo, M, headerY, 104, 124);
    tx = M + 132;
  }
  setFont(ctx, 30, 600);
  ctx.textAlign = 'right';
  ctx.fillStyle = c.muted;
  ctx.fillText(br(today), STORY_W - M, headerY + 72);
  const dateW = ctx.measureText(br(today)).width + 30;
  if (person.clube) {
    fitFont(ctx, person.clube, STORY_W - M - dateW - tx, 42, 26, 800);
    ctx.textAlign = 'left';
    ctx.fillStyle = WHITE;
    ctx.fillText(person.clube, tx, headerY + 74);
  }

  // Destaque
  stack(heroRows(ctx, card, c), HERO_TOP, HERO_BOTTOM);

  // Atleta: foto, nome e categoria
  const py = 1330;
  const ph = 230;
  roundRect(ctx, M, py, CW, ph, 52);
  ctx.fillStyle = rgba(c.panel, 0.88);
  ctx.fill();
  ctx.strokeStyle = rgba(c.accent, 0.35);
  ctx.lineWidth = 3;
  ctx.stroke();
  const r = 78;
  const cx = M + 44 + r;
  const cy = py + ph / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = c.accent;
  ctx.fill();
  if (assets.foto) {
    circleImage(ctx, assets.foto, cx, cy, r);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = c.panel;
    ctx.fill();
    setFont(ctx, 60, 900);
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(person.nome), cx, cy + 3);
    ctx.textBaseline = 'alphabetic';
  }
  const nx = cx + r + 44;
  const nw = M + CW - 40 - nx;
  const name = shortName(person.nome);
  fitFont(ctx, name, nw, 60, 34, 900);
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  ctx.fillText(name, nx, cy - 6);
  const meta = [categoryLabel(person.categoria), person.classe].filter(Boolean).join(' • ');
  if (meta) {
    fitFont(ctx, meta, nw, 36, 24, 600);
    ctx.fillStyle = c.muted;
    ctx.fillText(meta, nx, cy + 50);
  }

  // Rodapé discreto: marca da plataforma
  const text = `feito com ${brand}`;
  setFont(ctx, 32, 700);
  const fw = ctx.measureText(text).width;
  const icon = 50;
  const gap = 16;
  let fx = (STORY_W - fw - (assets.logo ? icon + gap : 0)) / 2;
  const fy = 1652;
  if (assets.logo) {
    ctx.save();
    roundRect(ctx, fx, fy - 38, icon, icon, 12);
    ctx.clip();
    ctx.drawImage(assets.logo, fx, fy - 38, icon, icon);
    ctx.restore();
    fx += icon + gap;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(WHITE, 0.72);
  ctx.fillText(text, fx, fy);
}

// ---------- No navegador ----------

/** Cores do clube aplicadas no app (variáveis do tema); sem tema, as padrão. */
export function readStoryColors(): StoryColors {
  const d = DEFAULT_STORY_COLORS;
  if (typeof document === 'undefined') return d;
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const parts = css.getPropertyValue(name).trim().split(/[\s,]+/).map(Number);
    return parts.length === 3 && parts.every((n) => Number.isFinite(n))
      ? `#${parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
      : fallback;
  };
  return {
    accent: get('--sky-500', d.accent),
    accentSoft: get('--sky-300', d.accentSoft),
    base: get('--slate-950', d.base),
    panel: get('--slate-900', d.panel),
    muted: get('--slate-400', d.muted),
  };
}

export function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const remote = /^https?:/i.test(src) && !src.startsWith(window.location.origin);
    if (remote) img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    // Endereço próprio do cartão: não reaproveita do cache uma cópia sem permissão (CORS)
    img.src = remote ? `${src}${src.includes('?') ? '&' : '?'}cartao=1` : src;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível montar a imagem.'))), type, quality);
    } catch (err) {
      reject(err);
    }
  });
}

/** Monta o cartão (PNG 1080 × 1920). Sem foto ou escudo disponível, sai sem eles. */
export async function renderStory(card: StoryCard, person: StoryPerson, brand: string): Promise<Blob> {
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    // sem a API de fontes: usa as do sistema
  }
  const [foto, escudo, logo] = await Promise.all([loadImage(person.foto), loadImage(person.escudo), loadImage('/icons/icon-192.png')]);
  const draw = (assets: StoryAssets) => {
    const canvas = document.createElement('canvas');
    canvas.width = STORY_W;
    canvas.height = STORY_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível montar a imagem.');
    drawStory(ctx, card, person, assets, readStoryColors(), brand, todayISO());
    return canvasToBlob(canvas);
  };
  try {
    return await draw({ foto, escudo, logo });
  } catch {
    // Imagem sem permissão "suja" o desenho: tenta de novo só com o que é do próprio app
    return draw({ logo });
  }
}

export type ShareResult = 'compartilhado' | 'cancelado' | 'indisponivel';

/** O celular sabe compartilhar arquivo (Instagram, WhatsApp...)? No computador, em geral não. */
export function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  return typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] });
}

/** Abre a janela de compartilhar do celular só com a imagem (texto junto atrapalha o Instagram). */
export async function shareFile(file: File): Promise<ShareResult> {
  if (!canShareFile(file)) return 'indisponivel';
  try {
    await navigator.share({ files: [file] });
    return 'compartilhado';
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? 'cancelado' : 'indisponivel';
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
