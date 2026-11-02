import { addDaysISO } from './date';
import { PseRecord } from '../types';

/**
 * Carga interna de treino (método de Foster): carga da sessão = PSE x duração (min), em UA.
 * Indicadores para uma data de referência D:
 *  - Carga aguda: soma dos 7 dias até D.
 *  - Carga crônica: média semanal dos 28 dias até D (soma / 4).
 *  - ACWR: aguda / crônica.
 *  - Monotonia: média diária / desvio-padrão diário dos 7 dias (dias sem treino = 0).
 *  - Strain: carga aguda x monotonia.
 */

export const sessionLoad = (r: PseRecord): number | null =>
  r.did_not_train || !r.rpe_score || !r.duration_minutes ? null : r.rpe_score * r.duration_minutes;

/** Carga diária por atleta: Map<athleteId, Map<data, UA>>. */
export function dailyLoads(records: PseRecord[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of records) {
    const l = sessionLoad(r);
    if (l === null) continue;
    const m = out.get(r.athlete_id) ?? new Map<string, number>();
    m.set(r.date, (m.get(r.date) ?? 0) + l);
    out.set(r.athlete_id, m);
  }
  return out;
}

export type AcwrZone = 'baixa' | 'ideal' | 'atencao' | 'risco';

export interface LoadMetrics {
  acute: number; // UA nos 7 dias
  chronic: number; // UA média semanal (28 dias)
  acwr: number | null;
  zone: AcwrZone | null;
  monotony: number | null;
  strain: number | null;
  sessions: number; // treinos com carga nos 7 dias
  /** menos de 3 semanas de dados na janela de 28 dias: ACWR pouco confiável */
  insufficient: boolean;
}

export const acwrZone = (v: number): AcwrZone => (v < 0.8 ? 'baixa' : v <= 1.3 ? 'ideal' : v <= 1.5 ? 'atencao' : 'risco');

export const ZONE_INFO: Record<AcwrZone, { label: string; cls: string }> = {
  baixa: { label: 'Abaixo', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  ideal: { label: 'Ideal', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  atencao: { label: 'Atenção', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  risco: { label: 'Risco', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

export const MONOTONY_LIMIT = 2;

const lastDays = (end: string, days: number) => Array.from({ length: days }, (_, k) => addDaysISO(end, -(days - 1 - k)));

/** Indicadores de um atleta (cargas diárias) na data de referência. */
export function loadMetrics(daily: Map<string, number> | undefined, ref: string, sessionsIn7 = 0): LoadMetrics {
  const d = daily ?? new Map<string, number>();
  const week = lastDays(ref, 7).map((x) => d.get(x) ?? 0);
  const month = lastDays(ref, 28).map((x) => d.get(x) ?? 0);
  const acute = week.reduce((a, b) => a + b, 0);
  const chronic = month.reduce((a, b) => a + b, 0) / 4;
  const mean = acute / 7;
  const sd = Math.sqrt(week.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
  const monotony = acute > 0 && sd > 0 ? mean / sd : null;
  const acwr = chronic > 0 ? acute / chronic : null;
  const firstDay = [...d.keys()].filter((x) => x <= ref).sort()[0];
  return {
    acute,
    chronic,
    acwr,
    zone: acwr === null ? null : acwrZone(acwr),
    monotony,
    strain: monotony === null ? null : acute * monotony,
    sessions: sessionsIn7,
    insufficient: !firstDay || firstDay > addDaysISO(ref, -20),
  };
}

/** Série diária: carga média por atleta, carga aguda/crônica e ACWR do grupo. */
export function groupSeries(perAthlete: Map<string, Map<string, number>>, athleteIds: string[], days: string[]) {
  const n = Math.max(athleteIds.length, 1);
  const groupDaily = new Map<string, number>();
  const first = addDaysISO(days[0], -27);
  for (const id of athleteIds) {
    for (const [date, v] of perAthlete.get(id) ?? []) {
      if (date < first || date > days[days.length - 1]) continue;
      groupDaily.set(date, (groupDaily.get(date) ?? 0) + v / n);
    }
  }
  return days.map((date) => {
    const m = loadMetrics(groupDaily, date);
    return { date, load: groupDaily.get(date) ?? 0, acute: m.acute, chronic: m.chronic, acwr: m.acwr };
  });
}

export const formatUA = (v: number) => Math.round(v).toLocaleString('pt-BR');
export const format2 = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ','));
