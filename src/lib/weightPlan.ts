/**
 * Plano de peso para competições.
 *
 * Regra do clube: quanto o atleta pode estar ACIMA do limite da categoria, conforme a
 * distância até a pesagem oficial:
 *   - longe da competição (14 dias ou mais): até 8%
 *   - semana anterior à da competição (7 a 13 dias): até 5%
 *   - semana da competição (1 a 6 dias): até 3%
 *   - no dia da pesagem: dentro da categoria
 *
 * Status:
 *   - seguro: dentro do limite da fase
 *   - atencao: dentro do limite de agora, mas acima do limite da próxima fase, que começa
 *     em até 7 dias (precisa descer aos poucos)
 *   - risco: acima do limite da fase (ou acima da categoria no dia da pesagem)
 */

export type WeightPlanStatus =
  | 'sem_dados'
  | 'sem_categoria'
  | 'sem_limite'
  | 'no_alvo'
  | 'seguro'
  | 'atencao'
  | 'risco'
  | 'pesagem_passou';

export type WeightPhase = 'longe' | 'semana_anterior' | 'semana_competicao' | 'pesagem';

/** Fases: a partir de quantos dias antes da pesagem e o máximo acima da categoria (%) */
export const WEIGHT_PHASES: { phase: WeightPhase; fromDays: number; maxPercent: number; label: string }[] = [
  { phase: 'longe', fromDays: 14, maxPercent: 8, label: 'longe da competição' },
  { phase: 'semana_anterior', fromDays: 7, maxPercent: 5, label: 'semana anterior à competição' },
  { phase: 'semana_competicao', fromDays: 1, maxPercent: 3, label: 'semana da competição' },
  { phase: 'pesagem', fromDays: 0, maxPercent: 0, label: 'dia da pesagem' },
];

/** Diferença até a qual o atleta já conta como "no peso" (balanças variam uns gramas). */
export const GAP_TOLERANCE = 0.05;

export interface WeightPoint {
  date: string; // AAAA-MM-DD
  weight: number;
}

export interface WeightLimit {
  percent: number;
  /** Peso máximo (kg), arredondado para baixo */
  weight: number;
}

export interface WeightPlan {
  target: number | null;
  current: number | null;
  /** Peso atual - peso da categoria. Positivo = acima da categoria. */
  gap: number | null;
  /** Quanto está acima da categoria, em % do peso da categoria */
  gapPercent: number | null;
  days: number;
  phase: WeightPhase;
  /** Limite da fase atual */
  limit: WeightLimit | null;
  /** Próxima fase (limite menor) e a data em que começa */
  nextLimit: (WeightLimit & { from: string; label: string }) | null;
  trendWeeklyRate: number | null;
  trendWeeklyPercent: number | null;
  projectedWeight: number | null;
  lastWeightDate: string | null;
  stale: boolean;
  status: WeightPlanStatus;
  /** Mostrar o limite de peso da fase? (categoria com limite e pesagem ainda por vir) */
  showLimit: boolean;
  /** Está acima da categoria (além da tolerância). */
  needsToLose: boolean;
  title: string;
  message: string;
}

interface BuildWeightPlanInput {
  currentWeight: number | null | undefined;
  currentDate?: string | null;
  targetWeight: number | null | undefined;
  /** Categoria do atleta, ex.: "-66" ou "+100". */
  category?: string | null;
  weighInDate: string;
  today: string;
  history?: WeightPoint[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;
const kgText = (v: number) => `${v.toFixed(1).replace('.', ',')} kg`;
const pctText = (v: number) => `${round1(v).toString().replace('.', ',')}%`;
const brShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "-66" -> 66; "+100" -> null (categoria sem limite superior). */
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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

/** Fase do plano conforme os dias até a pesagem. */
export function phaseFor(daysToWeighIn: number) {
  return WEIGHT_PHASES.find((p) => daysToWeighIn >= p.fromDays) ?? WEIGHT_PHASES[WEIGHT_PHASES.length - 1];
}

const limitFor = (target: number, percent: number): WeightLimit => ({ percent, weight: floor1(target * (1 + percent / 100)) });

/** Limite de peso de um dia conforme os dias até a pesagem (sem pesagem marcada = longe da competição). */
export function weightLimitFor(targetWeight: number, daysToWeighIn: number | null): WeightLimit {
  const percent = daysToWeighIn === null ? WEIGHT_PHASES[0].maxPercent : phaseFor(daysToWeighIn).maxPercent;
  return limitFor(targetWeight, percent);
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
  const isPlusCategory = /^\s*\+/.test((category ?? '').trim());
  const missingCategory = target === null && !isPlusCategory;
  const daysToWeighIn = daysBetweenISO(today, weighInDate);
  const days = Math.max(0, daysToWeighIn);
  const weeks = days / 7;
  const lastWeightDate = currentDate ?? null;
  const stale = Boolean(lastWeightDate && daysBetweenISO(lastWeightDate, today) > 14);

  const phaseInfo = phaseFor(days);
  const gap = current !== null && target !== null ? current - target : null;
  const gapPercent = gap !== null && target ? (gap / target) * 100 : null;
  const limit = target !== null ? limitFor(target, phaseInfo.maxPercent) : null;

  // Próxima fase com limite menor (o dia da pesagem não entra: lá a regra é estar na categoria).
  // Começa 13 dias antes da pesagem (semana anterior) ou 6 dias antes (semana da competição).
  const nextPhase = WEIGHT_PHASES.find((p) => p.fromDays < phaseInfo.fromDays && p.phase !== 'pesagem');
  const nextLimit =
    target !== null && nextPhase
      ? {
          ...limitFor(target, nextPhase.maxPercent),
          from: addDays(weighInDate, -(nextPhase.phase === 'semana_anterior' ? 13 : 6)),
          label: nextPhase.label,
        }
      : null;
  const daysToNext = nextLimit ? daysBetweenISO(today, nextLimit.from) : Infinity;

  let status: WeightPlanStatus;
  if (daysToWeighIn < 0) status = 'pesagem_passou';
  else if (missingCategory) status = 'sem_categoria';
  else if (target === null) status = 'sem_limite';
  else if (current === null || gap === null || gapPercent === null) status = 'sem_dados';
  else if (gap <= GAP_TOLERANCE) status = 'no_alvo';
  else if (gapPercent > phaseInfo.maxPercent + 1e-9) status = 'risco';
  else if (nextLimit && daysToNext <= 7 && gapPercent > nextLimit.percent + 1e-9) status = 'atencao';
  else status = 'seguro';

  // Tendência real: usa o primeiro e o último registro dos últimos 21 dias.
  const recent = [...history]
    .filter((p) => Number.isFinite(p.weight) && p.weight > 0 && daysBetweenISO(p.date, today) <= 21)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanDays = first && last ? daysBetweenISO(first.date, last.date) : 0;
  const trendWeeklyRate = first && last && spanDays >= 3 ? ((last.weight - first.weight) / spanDays) * 7 : null;
  const trendWeeklyPercent = trendWeeklyRate !== null && current ? (trendWeeklyRate / current) * 100 : null;
  const projectedWeight = trendWeeklyRate !== null && current !== null && weeks > 0 ? round1(current + trendWeeklyRate * weeks) : null;

  // Textos
  const acima = gap !== null && gapPercent !== null ? `${kgText(gap)} (${pctText(gapPercent)}) acima da categoria` : '';
  const limiteAgora = limit ? `até ${kgText(limit.weight)} (${phaseInfo.maxPercent}% acima)` : '';
  let title: string;
  let message: string;
  switch (status) {
    case 'pesagem_passou':
      title = 'Pesagem oficial já feita';
      message = 'A pesagem desta competição já aconteceu. Siga a orientação do seu treinador para a recuperação.';
      break;
    case 'sem_categoria':
      title = 'Categoria não cadastrada';
      message = 'Peça ao seu treinador para cadastrar sua categoria de peso. Assim o app mostra o limite de peso até a pesagem.';
      break;
    case 'sem_limite':
      title = 'Categoria sem limite superior';
      message = 'Seu peso de luta não tem limite superior. O foco é manter o acompanhamento e a recuperação.';
      break;
    case 'sem_dados':
      title = 'Sem pesagem registrada';
      message = 'Registre seu peso para o app comparar com o limite da sua categoria.';
      break;
    case 'no_alvo':
      title = 'Peso dentro da categoria';
      message = 'Você já está no peso da categoria. Mantenha o acompanhamento até a pesagem.';
      break;
    case 'seguro':
      title = 'Dentro do limite';
      message = `Você está ${acima}. Na ${phaseInfo.label} o limite é ${limiteAgora}.`;
      break;
    case 'atencao':
      title = 'Atenção: o limite vai baixar';
      message =
        `Você está ${acima}, dentro do limite de agora. A partir de ${brShort(nextLimit!.from)} (${nextLimit!.label}) o limite é ` +
        `até ${kgText(nextLimit!.weight)} (${nextLimit!.percent}% acima). Converse com seu treinador para chegar lá aos poucos.`;
      break;
    default:
      title = phaseInfo.phase === 'pesagem' ? 'Acima da categoria no dia da pesagem' : 'Acima do limite desta fase';
      message =
        phaseInfo.phase === 'pesagem'
          ? `Hoje é a pesagem e você está ${acima}. Fale com seu treinador agora.`
          : `Você está ${acima}. Na ${phaseInfo.label} o limite é ${limiteAgora}. Converse com seu treinador antes de mudar a alimentação ou o treino.`;
  }
  if (stale && status !== 'sem_dados' && status !== 'pesagem_passou') {
    message = `${message} Sua última pesagem está há mais de 14 dias; registre novamente.`;
  }

  return {
    target,
    current,
    gap,
    gapPercent,
    days,
    phase: phaseInfo.phase,
    limit,
    nextLimit,
    trendWeeklyRate,
    trendWeeklyPercent,
    projectedWeight,
    lastWeightDate,
    stale,
    status,
    showLimit: target !== null && status !== 'pesagem_passou',
    needsToLose: gap !== null && gap > GAP_TOLERANCE && status !== 'pesagem_passou',
    title,
    message,
  };
}

export const WEIGHT_STATUS_LABEL: Record<WeightPlanStatus, string> = {
  sem_dados: 'Sem pesagem',
  sem_categoria: 'Sem categoria',
  sem_limite: 'Sem limite',
  no_alvo: 'No peso',
  seguro: 'Dentro do limite',
  atencao: 'Atenção',
  risco: 'Acima do limite',
  pesagem_passou: 'Pesagem feita',
};
