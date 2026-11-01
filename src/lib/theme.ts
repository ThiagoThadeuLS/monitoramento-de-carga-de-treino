import { supabase } from './supabase';

/** Paleta do clube: cor principal (botões, destaques) e cor de fundo. */
export interface ClubTheme {
  accent: string; // #rrggbb
  base: string; // #rrggbb (fundo mais escuro)
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Padrão (azul): os mesmos valores do Tailwind, para nada mudar em quem não escolher paleta
const DEFAULT_ACCENT = ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'];
const DEFAULT_BASE = ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'];
export const DEFAULT_THEME: ClubTheme = { accent: '#0ea5e9', base: '#020617' };

export const PRESETS: { id: string; nome: string; theme: ClubTheme }[] = [
  { id: 'azul', nome: 'Azul (padrão)', theme: DEFAULT_THEME },
  { id: 'verde', nome: 'Verde', theme: { accent: '#22c55e', base: '#03110a' } },
  { id: 'laranja', nome: 'Laranja', theme: { accent: '#f97316', base: '#0c0806' } },
  { id: 'vermelho', nome: 'Vermelho', theme: { accent: '#ef4444', base: '#0f0607' } },
  { id: 'roxo', nome: 'Roxo', theme: { accent: '#a855f7', base: '#0a0614' } },
  { id: 'dourado', nome: 'Dourado', theme: { accent: '#eab308', base: '#0a0905' } },
  { id: 'turquesa', nome: 'Turquesa', theme: { accent: '#14b8a6', base: '#03100f' } },
  { id: 'rosa', nome: 'Rosa', theme: { accent: '#ec4899', base: '#10060b' } },
];

export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
export const sameTheme = (a: ClubTheme, b: ClubTheme) =>
  a.accent.toLowerCase() === b.accent.toLowerCase() && a.base.toLowerCase() === b.base.toLowerCase();

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
const mix = (hex: string, target: string, amount: number) => {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
};

/** Escala 50–950 da cor principal (500 = a cor escolhida). */
function accentScale(hex: string): string[] {
  const light = [0.92, 0.84, 0.66, 0.46, 0.22]; // 50..400: mistura com branco
  const dark = [0.16, 0.32, 0.46, 0.58, 0.72]; // 600..950: mistura com preto
  return [...light.map((f) => mix(hex, '#ffffff', f)), hex.toLowerCase(), ...dark.map((f) => mix(hex, '#000000', f))];
}

/** Escala 50–950 do fundo (950 = a cor escolhida; tons claros levemente tingidos). */
function baseScale(hex: string): string[] {
  const steps = [0.975, 0.95, 0.89, 0.8, 0.6, 0.42, 0.3, 0.2, 0.12, 0.055]; // 50..900
  const tintedWhite = mix('#ffffff', hex, 0.04);
  return [...steps.map((f) => mix(hex, tintedWhite, f)), hex.toLowerCase()];
}

/** Contraste (WCAG) entre duas cores. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = toRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const CACHE_KEY = 'tema_clube';
const varValue = (hex: string) => toRgb(hex).join(' ');

/** Aplica a paleta no app inteiro (variáveis usadas pelas cores "sky" e "slate"). */
export function applyTheme(theme: ClubTheme | null) {
  const t = theme && isHex(theme.accent) && isHex(theme.base) ? theme : DEFAULT_THEME;
  const isDefault = sameTheme(t, DEFAULT_THEME);
  const accent = isDefault ? DEFAULT_ACCENT : accentScale(t.accent);
  const base = isDefault ? DEFAULT_BASE : baseScale(t.base);
  const root = document.documentElement.style;
  SHADES.forEach((s, i) => {
    root.setProperty(`--sky-${s}`, varValue(accent[i]));
    root.setProperty(`--slate-${s}`, varValue(base[i]));
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base[10]);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(t));
  } catch {
    /* sem armazenamento */
  }
}

/** Ao abrir o app: usa a última paleta vista neste aparelho (antes de carregar o clube). */
export function applyCachedTheme() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) applyTheme(JSON.parse(raw));
  } catch {
    /* ignora */
  }
}

/** Paleta salva do clube (null = padrão). */
export async function fetchClubTheme(clubId: string): Promise<ClubTheme | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('club_theme', { p_club: clubId });
  if (error || !data) return null;
  return data as ClubTheme;
}

/** Salva a paleta do clube (só admin do clube). null = volta ao padrão. */
export async function saveClubTheme(theme: ClubTheme | null) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('club_set_theme', { p_accent: theme?.accent ?? null, p_base: theme?.base ?? null });
  if (error) {
    if (/Could not find the function/.test(error.message)) throw new Error('A paleta ainda não foi ativada no banco (rode o supabase_completo.sql).');
    if (/somente_admin/.test(error.message)) throw new Error('Só o admin do clube pode mudar as cores.');
    if (/modo_suporte/.test(error.message)) throw new Error('Modo suporte: somente leitura.');
    throw new Error(`Erro: ${error.message}`);
  }
}
