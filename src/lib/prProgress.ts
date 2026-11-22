import { stampInAppZone } from './date';

/** Um ponto do histórico como vem do banco (athlete_list_prs). */
export interface PrHistoryInput {
  id?: string;
  peso_pr: number;
  /** Dia do registro (AAAA-MM-DD); sem ele vale o dia de created_at */
  data?: string;
  created_at?: string;
}

/** Carga de um dia (AAAA-MM-DD, horário de Brasília). */
export interface PrDayPoint {
  date: string;
  peso: number;
}

/** Cada registro, do mais novo para o mais antigo. */
export interface PrStep extends PrDayPoint {
  /** Registro do histórico (para corrigir ou apagar) */
  id?: string;
  /** Diferença para o registro anterior (null = primeiro registro). */
  diff: number | null;
}

export interface PrProgress {
  /** Um ponto por dia (vale o último registro do dia), do mais antigo para o mais novo. */
  points: PrDayPoint[];
  first: PrDayPoint | null;
  current: number;
  /** Maior carga já registrada. */
  best: number;
  /** Atual menos o primeiro registro (kg). */
  gainKg: number;
  /** Ganho em % sobre o primeiro registro (null sem histórico). */
  gainPct: number | null;
  /** Quantas vezes a carga subiu. */
  improvements: number;
  /** Data da última vez em que a carga subiu. */
  lastImprovement: string | null;
  steps: PrStep[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Evolução de um PR a partir do histórico do banco e da carga atual. */
export function buildPrProgress(history: PrHistoryInput[], current: number, updatedAt?: string): PrProgress {
  const entries = history
    .map((h) => ({ id: h.id, date: h.data || stampInAppZone(h.created_at)[0], peso: Number(h.peso_pr), at: h.created_at ?? '' }))
    .filter((h) => h.date && Number.isFinite(h.peso) && h.peso > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  // Sem histórico (banco antigo): só o PR atual
  if (entries.length === 0) {
    const date = stampInAppZone(updatedAt)[0];
    if (date) entries.push({ id: undefined, date, peso: current, at: updatedAt ?? '' });
  }

  // Um ponto por dia: vale o último registro do dia (correções no mesmo dia não viram "evolução")
  const points: PrDayPoint[] = [];
  for (const e of entries) {
    const last = points[points.length - 1];
    if (last && last.date === e.date) last.peso = e.peso;
    else points.push({ date: e.date, peso: e.peso });
  }

  // Evolução: por dia. Lista de registros: um por um (dá para corrigir cada registro).
  const dayDiffs = points.map((p, i) => (i === 0 ? null : round1(p.peso - points[i - 1].peso)));
  const ups = points.filter((_, i) => (dayDiffs[i] ?? 0) > 0);
  const steps: PrStep[] = entries.map((e, i) => ({
    id: e.id,
    date: e.date,
    peso: e.peso,
    diff: i === 0 ? null : round1(e.peso - entries[i - 1].peso),
  }));
  const first = points[0] ?? null;

  return {
    points,
    first,
    current,
    best: Math.max(current, ...points.map((p) => p.peso)),
    gainKg: first ? round1(current - first.peso) : 0,
    gainPct: first && first.peso > 0 ? round1(((current - first.peso) / first.peso) * 100) : null,
    improvements: ups.length,
    lastImprovement: ups.length ? ups[ups.length - 1].date : null,
    steps: [...steps].reverse(),
  };
}
