/**
 * Plano de peso para competições.
 *
 * A regra é intencionalmente conservadora: a faixa considerada segura é de
 * 0,5% a 1% do peso corporal por semana. O app não incentiva cortes rápidos;
 * quando a meta exige mais do que isso, o status vira "risco" e o atleta é
 * orientado a conversar com o treinador.
 */

export type WeightPlanStatus = 'sem_dados' | 'sem_categoria' | 'sem_limite' | 'no_alvo' | 'seguro' | 'atencao' | 'risco';

export interface WeightPoint {
  date: string; // AAAA-MM-DD
  weight: number;
}

export interface WeightPlan {
  target: number | null;
  current: number | null;
  /** Peso atual - peso de luta. Positivo = ainda precisa perder. */
  gap: number | null;
  days: number;
  weeks: number;
  safeWeeklyMin: number;
  safeWeeklyMax: number;
  /** Faixa de peso considerada segura na data da pesagem. */
  safeMin: number;
  safeMax: number;
  requiredWeeklyRate: number | null;
  requiredWeeklyPercent: number | null;
  trendWeeklyRate: number | null;
  trendWeeklyPercent: number | null;
  projectedWeight: number | null;
  lastWeightDate: string | null;
  stale: boolean;
  status: WeightPlanStatus;
  title: string;
  message: string;
}

interface BuildWeightPlanInput {
  currentWeight: number | null | undefined;
  currentDate?: string | null;
  targetWeight: number | null | undefined;
  /** Categoria do atleta, ex.: "-66Kg" ou "+100Kg". */
  category?: string | null;
  weighInDate: string;
  today: string;
  history?: WeightPoint[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** "-66Kg" -> 66; "+100Kg" -> null (categoria sem limite superior). */
export function parseCategoryWeight(categoria?: string | null): number | null {
  const match = /^\s*-\s*(\d+(?:[.,]\d+)?)/.exec(categoria ?? '');
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Diferença em dias entre duas datas AAAA-MM-DD (to - from). */
export function daysBetweenISO(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function statusMessage(status: WeightPlanStatus, gap: number | null, days: number, safeMin: number, safeMax: number, stale: boolean): { title: string; message: string } {
  const falta = gap && gap > 0 ? `${round1(gap).toFixed(1).replace('.', ',')} kg` : '';
  const faixa = `${round1(safeMin).toFixed(1).replace('.', ',')} a ${round1(safeMax).toFixed(1).replace('.', ',')} kg`;
  const base =
    status === 'sem_categoria'
      ? {
          title: 'Categoria não cadastrada',
          message: 'Peça ao seu treinador para cadastrar sua categoria de peso. Assim o app calcula a faixa segura até a pesagem.',
        }
      : status === 'sem_limite'
      ? {
          title: 'Categoria sem limite superior',
          message: 'Seu peso de luta não tem limite superior. O foco é manter o acompanhamento e a recuperação.',
        }
      : status === 'sem_dados'
      ? {
          title: 'Sem pesagem registrada',
          message: 'Registre seu peso para o app calcular a faixa segura até a pesagem.',
        }
      : status === 'no_alvo'
      ? {
          title: 'Peso dentro da categoria',
          message: 'Você já está no peso de luta. Mantenha o acompanhamento até a pesagem.',
        }
      : status === 'seguro'
      ? {
          title: 'Ritmo dentro da faixa segura',
          message: `Faltam ${falta} em ${days} dia${days === 1 ? '' : 's'}. A faixa segura na pesagem é de ${faixa}.`,
        }
      : status === 'atencao'
      ? {
          title: 'Atenção ao ritmo de perda',
          message: `Faltam ${falta} em ${days} dia${days === 1 ? '' : 's'}. A faixa segura na pesagem é de ${faixa}. Reduza a velocidade e converse com seu treinador.`,
        }
      : {
          title: 'Perda acima do recomendado',
          message: `Faltam ${falta} em ${days} dia${days === 1 ? '' : 's'}. A faixa segura na pesagem é de ${faixa}. Converse com seu treinador antes de continuar.`,
        };

  if (stale && status !== 'sem_dados') {
    return { ...base, message: `${base.message} Sua última pesagem está há mais de 14 dias; registre novamente.` };
  }
  return base;
}

export function buildWeightPlan({
  currentWeight,
  currentDate,
  targetWeight,
  category,
  weighInDate,
  today,
  history = [],
}: BuildWeightPlanInput): WeightPlan {
  const target = targetWeight && targetWeight > 0 ? targetWeight : null;
  const current = currentWeight && currentWeight > 0 ? currentWeight : null;
  const categoryLabel = (category ?? '').trim();
  const isPlusCategory = /^\s*\+/.test(categoryLabel);
  const missingCategory = target === null && (!categoryLabel || !isPlusCategory);
  const days = Math.max(0, daysBetweenISO(today, weighInDate));
  const weeks = days / 7;
  const lastWeightDate = currentDate ?? null;
  const stale = Boolean(lastWeightDate && daysBetweenISO(lastWeightDate, today) > 14);

  const safeWeeklyMin = current ? current * 0.005 : 0;
  const safeWeeklyMax = current ? current * 0.01 : 0;
  const safeMin = current ? Math.max(0, current - safeWeeklyMax * weeks) : 0;
  const safeMax = current ? current - safeWeeklyMin * weeks : 0;

  const gap = current !== null && target !== null ? current - target : null;
  let status: WeightPlanStatus = 'sem_dados';

  if (missingCategory) {
    status = 'sem_categoria';
  } else if (target === null) {
    status = 'sem_limite';
  } else if (current === null || gap === null) {
    status = 'sem_dados';
  } else if (gap <= 0) {
    status = 'no_alvo';
  } else if (days <= 0) {
    status = 'risco';
  } else {
    const requiredWeeklyRate = gap / weeks;
    const requiredWeeklyPercent = current > 0 ? (requiredWeeklyRate / current) * 100 : 0;
    const totalPercent = current > 0 ? (gap / current) * 100 : 0;
    status = requiredWeeklyPercent <= 1 ? 'seguro' : requiredWeeklyPercent <= 1.5 ? 'atencao' : 'risco';
    // Nas últimas duas semanas, qualquer corte acima de 2% do peso já é tratado como risco.
    if (days < 14 && totalPercent > 2) status = 'risco';
  }

  const requiredWeeklyRate = gap !== null && weeks > 0 ? gap / weeks : null;
  const requiredWeeklyPercent =
    requiredWeeklyRate !== null && current ? (requiredWeeklyRate / current) * 100 : null;

  // Tendência real: usa o primeiro e o último registro dos últimos 21 dias.
  const recent = [...history]
    .filter((p) => Number.isFinite(p.weight) && p.weight > 0 && daysBetweenISO(p.date, today) <= 21)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanDays = first && last ? daysBetweenISO(first.date, last.date) : 0;
  const trendWeeklyRate = first && last && spanDays >= 3 ? ((last.weight - first.weight) / spanDays) * 7 : null;
  const trendWeeklyPercent = trendWeeklyRate !== null && current ? (trendWeeklyRate / current) * 100 : null;
  const projectedWeight = trendWeeklyRate !== null && current !== null && weeks > 0
    ? round1(current + trendWeeklyRate * weeks)
    : null;

  const messages = statusMessage(status, gap, days, safeMin, safeMax, stale);

  return {
    target,
    current,
    gap,
    days,
    weeks,
    safeWeeklyMin,
    safeWeeklyMax,
    safeMin,
    safeMax,
    requiredWeeklyRate,
    requiredWeeklyPercent,
    trendWeeklyRate,
    trendWeeklyPercent,
    projectedWeight,
    lastWeightDate,
    stale,
    status,
    ...messages,
  };
}

export const WEIGHT_STATUS_LABEL: Record<WeightPlanStatus, string> = {
  sem_dados: 'Sem pesagem',
  sem_categoria: 'Sem categoria',
  sem_limite: 'Sem limite',
  no_alvo: 'No alvo',
  seguro: 'Seguro',
  atencao: 'Atenção',
  risco: 'Risco',
};
