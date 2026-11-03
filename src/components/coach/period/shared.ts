import { supabase } from '../../../lib/supabase';
import { addDaysISO, stampInAppZone } from '../../../lib/date';
import { STATS, mean, median, modes } from '../../../lib/stats';
import { PsrRecord } from '../../../types';
import { DailyPoint, MarkerShape } from '../DailyStatsChart';

export const PSE_LIMIT = 6; // tabela: PSE acima de 6
export const PSR_LIMIT = 5; // tabela: variáveis da PSR abaixo de 5
export const MAX_DAYS = 366;
export const MOBILE_PREVIEW = 10; // celular: mostra os 10 primeiros e um botão "Mostrar todos"

export const PSR_VARIABLES: { key: keyof PsrRecord; label: string; short: string }[] = [
  { key: 'psr_score', label: 'Recuperação', short: 'Recup.' },
  { key: 'fatigue_score', label: 'Fadiga', short: 'Fadiga' },
  { key: 'sleep_score', label: 'Sono', short: 'Sono' },
  { key: 'muscle_soreness_score', label: 'Dor muscular', short: 'Dor' },
  { key: 'stress_score', label: 'Estresse', short: 'Estresse' },
  { key: 'mood_score', label: 'Humor', short: 'Humor' },
];

// Cores dos tipos de treino: validadas para o fundo escuro e diferentes das cores das estatísticas
export const TYPE_STYLES: Record<string, { color: string; shape: MarkerShape; short: string }> = {
  'Treino Técnico': { color: '#c98500', shape: 'circle', short: 'Técnico' },
  'Treino Randori': { color: '#d55181', shape: 'square', short: 'Randori' },
  'Treino Físico': { color: '#9085e9', shape: 'triangle', short: 'Físico' },
};

export type PseStat = 'mean' | 'mode';
export const PSE_STATS: { key: PseStat; label: string; title: string }[] = [
  { key: 'mean', label: 'Média', title: 'Média de PSE' },
  { key: 'mode', label: 'Moda', title: 'Moda da PSE' },
];
export const statStyle = (key: 'mean' | 'mode') => STATS.find((s) => s.key === key)!;

export const PRESETS = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
];

/** AAAA-MM-DD -> DD/MM/AAAA */
export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Lista todos os dias entre "de" e "até" (inclusive). */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDaysISO(d, 1)) days.push(d);
  return days;
}

/** O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas. */
export async function fetchRange<T>(table: string, from: string, to: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Média, mediana e moda de cada dia (dias sem resposta ficam vazios). */
export function dailyStats<T extends { date: string }>(records: T[], days: string[], value: (r: T) => number | null): DailyPoint[] {
  const byDay = new Map<string, number[]>();
  for (const r of records) {
    const v = value(r);
    if (v === null) continue;
    const list = byDay.get(r.date) ?? [];
    list.push(v);
    byDay.set(r.date, list);
  }
  return days.map((date) => {
    const list = byDay.get(date) ?? [];
    if (!list.length) return { date, count: 0, mean: null, median: null, mode: null, modes: [] };
    const m = modes(list);
    // Empate na moda: a linha usa o maior valor; o tooltip mostra todos
    return { date, count: list.length, mean: mean(list), median: median(list), mode: m[m.length - 1], modes: m };
  });
}

/** Hora do envio (HH:MM, horário de Brasília) */
export const timeOf = (iso?: string) => (iso ? stampInAppZone(iso)[1] || '—' : '—');

export const byCreated = (a: { created_at?: string }, b: { created_at?: string }) => (a.created_at ?? '').localeCompare(b.created_at ?? '');
