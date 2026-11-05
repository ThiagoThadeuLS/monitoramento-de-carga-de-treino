// Conquistas do atleta: sequência de dias, selos e resumos da semana e do mês.
// Só contas (sem tela); os dados vêm de athlete_achievements (getAthleteAchievements).
import type { AthleteAchievementsData } from './athleteAuth';
import { addDaysISO, dateInAppZone, startOfWeekISO } from './date';
import { GAP_TOLERANCE, daysBetweenISO, parseCategoryWeight, weightLimitFor } from './weightPlan';

export const STREAK_MARKS = [7, 30, 100];
export const TRAINING_MARKS = [10, 50, 100, 250, 500];
export const WEIGH_MARKS = [4, 12];
/** "Primeiro mês completo" = semanas seguidas com resposta */
export const MONTH_WEEKS = 4;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ---------- Sequência de dias ----------

export interface Streak {
  /** Dias seguidos agora */
  current: number;
  /** Maior sequência do último ano */
  best: number;
  /** Data em que uma sequência chegou a cada marco (7, 30, 100) pela primeira vez */
  reached: Record<number, string>;
}

/**
 * Dias seguidos respondendo. Contam os dias com treino programado: dia sem treino (folga)
 * não quebra a sequência, e responder num dia sem treino também conta. Hoje, se ainda não
 * respondeu, não quebra (o dia não acabou).
 */
export function computeStreak(answered: string[], training: string[], today: string): Streak {
  const ans = new Set(answered);
  const days = [...new Set([...answered, ...training])].filter((d) => d <= today).sort();
  let run = 0;
  let best = 0;
  const reached: Record<number, string> = {};
  for (const d of days) {
    if (ans.has(d)) {
      run += 1;
      best = Math.max(best, run);
      for (const m of STREAK_MARKS) if (run === m && !reached[m]) reached[m] = d;
    } else if (d !== today) {
      run = 0;
    }
  }
  return { current: run, best, reached };
}

/** Semanas seguidas (segunda a domingo) com pelo menos uma resposta. A semana atual sem resposta não quebra. */
export function weeksInARow(answered: string[], today: string): { current: number; reachedAt: string | null } {
  const firstOfWeek = new Map<string, string>();
  for (const d of [...answered].filter((x) => x <= today).sort()) {
    const w = startOfWeekISO(d);
    if (!firstOfWeek.has(w)) firstOfWeek.set(w, d);
  }
  if (firstOfWeek.size === 0) return { current: 0, reachedAt: null };
  const thisWeek = startOfWeekISO(today);
  let run = 0;
  let reachedAt: string | null = null;
  for (let w = [...firstOfWeek.keys()].sort()[0]; w <= thisWeek; w = addDaysISO(w, 7)) {
    if (firstOfWeek.has(w)) {
      run += 1;
      if (run === MONTH_WEEKS && !reachedAt) reachedAt = firstOfWeek.get(w)!;
    } else if (w !== thisWeek) {
      run = 0;
    }
  }
  return { current: run, reachedAt };
}

/**
 * Pesagens seguidas dentro do limite da categoria (regra do plano de peso: 8% longe da
 * competição, 5% na semana anterior, 3% na semana da competição, categoria no dia).
 * Categoria "+" (sem limite) ou sem categoria: o selo não vale para o atleta.
 */
export function weighInsInLimit(
  pesos: { date: string; weight: number }[],
  pesagens: string[],
  categoria: string | null | undefined
): { applicable: boolean; current: number; reached: Record<number, string> } {
  const target = parseCategoryWeight(categoria);
  if (target === null) return { applicable: false, current: 0, reached: {} };
  const official = [...pesagens].sort();
  let run = 0;
  const reached: Record<number, string> = {};
  for (const p of [...pesos].sort((a, b) => a.date.localeCompare(b.date))) {
    const next = official.find((d) => d >= p.date) ?? null;
    const limit = weightLimitFor(target, next ? daysBetweenISO(p.date, next) : null);
    if (p.weight <= limit.weight + GAP_TOLERANCE) {
      run += 1;
      for (const m of WEIGH_MARKS) if (run === m && !reached[m]) reached[m] = p.date;
    } else {
      run = 0;
    }
  }
  return { applicable: true, current: run, reached };
}

// ---------- Selos ----------

export interface Badge {
  id: string;
  /** Grupo do selo (sequencia, mes, treinos, peso): na tela aparece o próximo de cada grupo */
  group: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { value: number; target: number };
}

export function buildBadges(data: AthleteAchievementsData, streak: Streak): Badge[] {
  const badges: Badge[] = [];
  for (const n of STREAK_MARKS) {
    badges.push({
      id: `sequencia-${n}`,
      group: 'sequencia',
      emoji: '🔥',
      title: `${n} dias seguidos`,
      description: `Respondeu em ${n} dias de treino seguidos`,
      unlocked: streak.best >= n,
      unlockedAt: streak.reached[n] ?? null,
      progress: { value: Math.min(streak.current, n), target: n },
    });
  }
  const weeks = weeksInARow(data.dias_respondidos, data.today);
  badges.push({
    id: 'primeiro-mes',
    group: 'mes',
    emoji: '📅',
    title: 'Primeiro mês completo',
    description: `Respondeu em ${MONTH_WEEKS} semanas seguidas`,
    unlocked: !!weeks.reachedAt,
    unlockedAt: weeks.reachedAt,
    progress: { value: Math.min(weeks.current, MONTH_WEEKS), target: MONTH_WEEKS },
  });
  for (const n of TRAINING_MARKS) {
    badges.push({
      id: `treinos-${n}`,
      group: 'treinos',
      emoji: '💪',
      title: `${n} treinos`,
      description: `${n} treinos registrados no app`,
      unlocked: data.treinos >= n,
      unlockedAt: data.marcos_treinos[String(n)] ?? null,
      progress: { value: Math.min(data.treinos, n), target: n },
    });
  }
  const weigh = weighInsInLimit(data.pesos, data.pesagens, data.categoria);
  if (weigh.applicable) {
    for (const n of WEIGH_MARKS) {
      badges.push({
        id: `peso-${n}`,
        group: 'peso',
        emoji: '⚖️',
        title: `Peso no limite (${n})`,
        description: `${n} pesagens seguidas dentro do limite da categoria`,
        unlocked: !!weigh.reached[n],
        unlockedAt: weigh.reached[n] ?? null,
        progress: { value: Math.min(weigh.current, n), target: n },
      });
    }
  }
  return badges;
}

/** Na tela: os selos conquistados e o próximo de cada grupo (com o progresso). */
export function visibleBadges(badges: Badge[]): Badge[] {
  const nextShown = new Set<string>();
  return badges.filter((b) => {
    if (b.unlocked) return true;
    if (nextShown.has(b.group)) return false;
    nextShown.add(b.group);
    return true;
  });
}

/** Selo novo para comemorar: conquistado nos últimos 7 dias e ainda não visto (o maior, se houver vários). */
export function newestBadge(badges: Badge[], today: string, seen: Set<string>): Badge | null {
  const since = addDaysISO(today, -6);
  const fresh = badges.filter((b) => b.unlocked && b.unlockedAt && b.unlockedAt >= since && !seen.has(b.id));
  fresh.sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '') || b.progress.target - a.progress.target);
  return fresh[0] ?? null;
}

// ---------- Resumos ----------

export interface PeriodSummary {
  periodo: 'semana' | 'mes';
  from: string;
  to: string;
  /** "27/10 a 02/11" ou "Outubro de 2026" */
  titulo: string;
  treinos: number;
  minutos: number;
  /** Dias com alguma resposta */
  dias: number;
  /** PRs registrados ou atualizados no período */
  prs: number;
  tipoPrincipal: { tipo: string; n: number } | null;
  /** Só no mês: a semana de maior carga (PSE × minutos) */
  semanaForte: { from: string; to: string; minutos: number } | null;
  /** Só na semana: minutos em relação à semana anterior (%) */
  variacaoMinutos: number | null;
}

/** Semana para o resumo: no domingo, a semana que termina hoje; nos outros dias, a semana passada. */
export function weekToShare(today: string): { from: string; to: string } {
  const start = startOfWeekISO(today);
  if (addDaysISO(start, 6) === today) return { from: start, to: today };
  return { from: addDaysISO(start, -7), to: addDaysISO(start, -1) };
}

/** Mês para o resumo: o mês passado (completo). */
export function monthToShare(today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const from = `${py}-${String(pm).padStart(2, '0')}-01`;
  return { from, to: addDaysISO(`${y}-${String(m).padStart(2, '0')}-01`, -1) };
}

type PseRow = AthleteAchievementsData['pse'][number];
const trained = (rows: PseRow[], from: string, to: string) => rows.filter((r) => !r.did_not_train && r.date >= from && r.date <= to);
const minutesOf = (rows: PseRow[]) => rows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
const loadOf = (rows: PseRow[]) => rows.reduce((s, r) => s + (r.rpe_score ?? 0) * (r.duration_minutes ?? 0), 0);

export function summarize(data: AthleteAchievementsData, periodo: 'semana' | 'mes'): PeriodSummary {
  const { from, to } = periodo === 'semana' ? weekToShare(data.today) : monthToShare(data.today);
  const rows = trained(data.pse, from, to);
  const minutos = minutesOf(rows);

  const byType = new Map<string, number>();
  for (const r of rows) if (r.training_type) byType.set(r.training_type, (byType.get(r.training_type) ?? 0) + 1);
  const [tipo, n] = [...byType.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

  let semanaForte: PeriodSummary['semanaForte'] = null;
  let variacaoMinutos: number | null = null;
  if (periodo === 'mes') {
    let bestLoad = 0;
    for (let w = startOfWeekISO(from); w <= to; w = addDaysISO(w, 7)) {
      const ws = w < from ? from : w;
      const we = addDaysISO(w, 6) > to ? to : addDaysISO(w, 6);
      const weekRows = rows.filter((r) => r.date >= ws && r.date <= we);
      const load = loadOf(weekRows);
      if (load > bestLoad) {
        bestLoad = load;
        semanaForte = { from: ws, to: we, minutos: minutesOf(weekRows) };
      }
    }
  } else {
    const before = minutesOf(trained(data.pse, addDaysISO(from, -7), addDaysISO(to, -7)));
    if (before > 0) variacaoMinutos = Math.round(((minutos - before) / before) * 100);
  }

  const [y, m] = from.split('-').map(Number);
  return {
    periodo,
    from,
    to,
    titulo: periodo === 'semana' ? `${dm(from)} a ${dm(to)}` : `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} de ${y}`,
    treinos: rows.length,
    minutos,
    dias: data.dias_respondidos.filter((d) => d >= from && d <= to).length,
    prs: data.prs.filter((p) => {
      const d = p.updated_at ? dateInAppZone(new Date(p.updated_at)) : '';
      return d >= from && d <= to;
    }).length,
    tipoPrincipal: tipo ? { tipo, n: n! } : null,
    semanaForte,
    variacaoMinutos,
  };
}

/** Nome do mês do resumo, em minúsculas ("outubro") */
export const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];

// ---------- Tudo junto ----------

export interface AchievementsView {
  today: string;
  streak: Streak;
  badges: Badge[];
  week: PeriodSummary;
  month: PeriodSummary;
}

export function buildAchievements(data: AthleteAchievementsData): AchievementsView {
  const streak = computeStreak(data.dias_respondidos, data.dias_treino, data.today);
  return {
    today: data.today,
    streak,
    badges: buildBadges(data, streak),
    week: summarize(data, 'semana'),
    month: summarize(data, 'mes'),
  };
}
