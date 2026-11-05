/**
 * MÉTRICAS DO SISTEMA DE MONITORAMENTO DE CARGAA
 * ====================================================================
 *
 * Este arquivo reúne, num lugar só, todas as contas que o sistema faz com os dados dos atletas:
 * carga interna, ACWR, monotonia, strain, estatísticas de PSE/PSR, alertas, respostas em falta,
 * filtros de atletas e o plano de peso até a pesagem.
 *
 * - É uma CÓPIA fiel das funções usadas pelo app (mesmas fórmulas, mesmos limites).
 * - Não é usado pelo sistema: nada aqui é importado pelo app e o arquivo não tem acesso a banco,
 *   senhas ou dados reais. Serve só para leitura e conferência das fórmulas.
 * - Origem de cada parte no projeto: indicada no início de cada seção.
 * - Datas são texto "AAAA-MM-DD" (horário de Brasília). PSE e itens da PSR vão de 1 a 10.
 *
 * Para rodar o exemplo do fim do arquivo: `npx tsx metricas.ts` (Node 18+).
 */

// ===================================================================================
// 1. DADOS QUE O ATLETA REGISTRA
// ===================================================================================

/** PSE de um treino. Pode haver várias no mesmo dia (um registro por treino). */
export interface PseRecord {
  athlete_id: string;
  date: string; // AAAA-MM-DD
  training_type?: string; // 'Treino Técnico' | 'Treino Randori' | 'Treino Físico'
  rpe_score: number | null; // 1 a 10 (escala de Foster / CR-10); null quando "não treinei"
  did_not_train: boolean; // "não treinei" (com motivo)
  duration_minutes?: number | null; // 1 a 600 min (o app sugere a duração do treino do cronograma)
  created_at?: string; // momento do envio
}

/** PSR (bem-estar): uma por dia. Em todos os itens, 10 = melhor estado. */
export interface PsrRecord {
  athlete_id: string;
  date: string;
  psr_score: number; // Recuperação: 1 = péssima, 10 = totalmente recuperado
  fatigue_score: number; // Fadiga: 1 = exausto, 10 = sem fadiga
  sleep_score: number; // Sono: 1 = péssimo, 10 = perfeito
  muscle_soreness_score: number; // Dor muscular: 1 = muita dor, 10 = nenhuma dor
  stress_score: number; // Estresse: 1 = muito estressado, 10 = calmo
  mood_score: number; // Humor: 1 = desanimado, 10 = motivado
  created_at?: string;
}

/** Treino do cronograma (planejado pela comissão). */
export interface TrainingSession {
  id: string;
  date: string;
  start_time: string; // HH:MM
  end_time?: string | null;
  name: string;
  training_type: string;
  expected_pse: number; // PSE planejada, 1 a 10
  /** Público: todos | somente (incluir) | todos exceto (exceto) */
  audience?: 'todos' | 'incluir' | 'exceto';
  target_group_ids?: string[];
  target_athlete_ids?: string[];
}

export interface AthleteGroup {
  id: string;
  nome: string;
  members: string[]; // ids dos atletas
}

// ===================================================================================
// 2. DATAS (origem: src/lib/date.ts) — contas de dia em UTC para não sofrer com fuso/horário de verão
// ===================================================================================

const DAY_MS = 86_400_000;
const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const formatUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD. */
export function addDaysISO(iso: string, days: number): string {
  return formatUTC(parseISO(iso) + days * DAY_MS);
}

/** Diferença em dias entre duas datas (to - from). */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((parseISO(to) - parseISO(from)) / DAY_MS);
}

/** Todos os dias de "from" a "to" (inclusive). O app limita a 366 dias. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 366; d = addDaysISO(d, 1)) days.push(d);
  return days;
}

// ===================================================================================
// 3. CARGA INTERNA, ACWR, MONOTONIA E STRAIN (origem: src/lib/load.ts)
// ===================================================================================
//
// Método de Foster: carga da sessão = PSE x duração (min), em UA.
// Para uma data de referência D:
//  - Carga aguda: soma dos 7 dias até D (D-6 ... D).
//  - Carga crônica: média semanal dos 28 dias até D (soma dos 28 dias / 4). Médias móveis
//    simples, com a semana atual incluída na crônica (modelo "acoplado").
//  - ACWR: aguda / crônica.
//  - Monotonia: média diária / desvio-padrão diário dos 7 dias (dias sem treino = 0;
//    desvio-padrão populacional, divide por 7).
//  - Strain: carga aguda x monotonia.

/** Carga de uma sessão (UA). Fica fora (null) se "não treinei", sem PSE ou sem duração. */
export const sessionLoad = (r: PseRecord): number | null =>
  r.did_not_train || !r.rpe_score || !r.duration_minutes ? null : r.rpe_score * r.duration_minutes;

/** Carga diária por atleta (soma das sessões do dia): Map<atleta, Map<data, UA>>. */
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

/** Faixas do ACWR: < 0,8 abaixo • 0,8 a 1,3 ideal • até 1,5 atenção • > 1,5 risco. */
export const acwrZone = (v: number): AcwrZone => (v < 0.8 ? 'baixa' : v <= 1.3 ? 'ideal' : v <= 1.5 ? 'atencao' : 'risco');

/** Monotonia acima deste valor aparece em destaque ("semana pouco variada"). */
export const MONOTONY_LIMIT = 2;

export interface LoadMetrics {
  acute: number; // UA nos 7 dias
  chronic: number; // UA média semanal (28 dias)
  acwr: number | null;
  zone: AcwrZone | null;
  monotony: number | null;
  strain: number | null;
  sessions: number; // treinos com carga nos 7 dias
  /** Primeiro registro há menos de 21 dias: ACWR pouco confiável (nome aparece com "*"). */
  insufficient: boolean;
}

/** Os N dias que terminam em "end" (inclusive), do mais antigo ao mais novo. */
const lastDays = (end: string, days: number) => Array.from({ length: days }, (_, k) => addDaysISO(end, -(days - 1 - k)));

/** Indicadores de um atleta (a partir das cargas diárias) na data de referência. */
export function loadMetrics(daily: Map<string, number> | undefined, ref: string, sessionsIn7 = 0): LoadMetrics {
  const d = daily ?? new Map<string, number>();
  const week = lastDays(ref, 7).map((x) => d.get(x) ?? 0); // dia sem treino = 0
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

/** Quantos treinos com carga cada atleta teve nos 7 dias até "ref". */
export function sessionsInWeek(records: PseRecord[], ref: string): Map<string, number> {
  const weekStart = addDaysISO(ref, -6);
  const out = new Map<string, number>();
  for (const r of records) {
    if (r.date >= weekStart && r.date <= ref && sessionLoad(r) !== null) out.set(r.athlete_id, (out.get(r.athlete_id) ?? 0) + 1);
  }
  return out;
}

/**
 * Série do GRUPO dia a dia: primeiro calcula a carga média por atleta em cada dia
 * (soma das cargas do dia / número de atletas da seleção, inclusive quem não treinou)
 * e depois aplica aguda, crônica e ACWR a essa série média.
 * A tela mostra 28 dias e busca 56 dias de PSE (28 de gráfico + 28 de histórico da crônica).
 */
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

/** Resumo da tela "Carga" do treinador (cartões do topo). */
export function loadSummary(rows: { m: LoadMetrics }[]) {
  const withData = rows.filter((r) => r.m.acute > 0 || r.m.chronic > 0);
  return {
    /** "Carga média 7 dias": média da carga aguda de quem tem dados */
    avgAcute: withData.length ? withData.reduce((a, r) => a + r.m.acute, 0) / withData.length : 0,
    /** "Em risco": ACWR > 1,5 */
    atRisk: rows.filter((r) => r.m.zone === 'risco').length,
    /** "Monotonia alta": > 2 */
    highMonotony: rows.filter((r) => (r.m.monotony ?? 0) > MONOTONY_LIMIT).length,
  };
}

// ===================================================================================
// 4. ESTATÍSTICAS (origem: src/lib/stats.ts e src/components/coach/period/shared.ts)
// ===================================================================================

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Mediana: valores ordenados; com quantidade par, média dos dois do meio. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Moda: todos os valores mais frequentes (pode haver empate), em ordem crescente. */
export function modes(values: number[]): number[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return [...counts.entries()].filter(([, c]) => c === max).map(([v]) => v).sort((a, b) => a - b);
}

export interface DailyPoint {
  date: string;
  count: number; // quantas respostas no dia
  mean: number | null;
  median: number | null;
  mode: number | null; // com empate, o gráfico usa o MAIOR valor
  modes: number[]; // todos os valores empatados (mostrados na dica do gráfico)
}

/** Média, mediana e moda de cada dia. Dia sem resposta fica vazio (não vira 0). */
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
    return { date, count: list.length, mean: mean(list), median: median(list), mode: m[m.length - 1], modes: m };
  });
}

// ===================================================================================
// 5. GRÁFICOS DE PERÍODO: PSE, PSE ESPERADA E PSR (origem: src/components/coach/period/PeriodCharts.tsx)
// ===================================================================================

/** Valor da PSE usado nos gráficos: "não treinei" fica fora. Um atleta com 2 treinos entra 2 vezes. */
export const pseValue = (r: PseRecord) => (r.did_not_train ? null : r.rpe_score);

/** PSE por dia (média ou moda), só dos tipos de treino marcados no filtro. */
export function pseDailyStats(pse: PseRecord[], days: string[], selectedTypes: string[]) {
  const inTypes = pse.filter((r) => r.training_type && selectedTypes.includes(r.training_type));
  return dailyStats(inTypes, days, pseValue);
}

/** PSE por dia separada por tipo de treino (modo "por tipo" do gráfico). */
export function pseDailyStatsByType(pse: PseRecord[], days: string[], selectedTypes: string[]) {
  return selectedTypes.map((type) => ({ type, daily: dailyStats(pse.filter((r) => r.training_type === type), days, pseValue) }));
}

/** PSR do grupo por dia: média SOMENTE do item Recuperação (psr_score). */
export const psrDailyStats = (psr: PsrRecord[], days: string[]) => dailyStats(psr, days, (r) => r.psr_score);

/** PSE esperada por dia: média da PSE planejada dos treinos do cronograma (dos tipos escolhidos). */
export function expectedPse(sessions: TrainingSession[], days: string[], types: string[]) {
  const byDay = new Map<string, number[]>();
  for (const s of sessions) {
    if (!types.includes(s.training_type)) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), s.expected_pse]);
  }
  return days.map((d) => {
    const list = byDay.get(d);
    return list ? { value: mean(list), sessions: list.length } : null;
  });
}

/** Cartões da tela "Hoje" do treinador: média de todas as PSE do dia e da Recuperação (1 casa). */
export function todayAverages(pse: PseRecord[], psr: PsrRecord[]) {
  const pseScores = pse.filter((p) => p.rpe_score !== null).map((p) => p.rpe_score!);
  const psrScores = psr.map((p) => p.psr_score);
  return {
    avgPse: pseScores.length ? Number(mean(pseScores).toFixed(1)) : null,
    avgPsr: psrScores.length ? Number(mean(psrScores).toFixed(1)) : null,
  };
}

// ===================================================================================
// 6. ALERTAS DO DIA (origem: src/components/coach/period/DayAlerts.tsx e shared.ts)
// ===================================================================================

export const PSE_LIMIT = 6; // alerta: PSE acima de 6
export const PSR_LIMIT = 5; // alerta: algum item da PSR abaixo de 5

export const PSR_VARIABLES: { key: keyof PsrRecord; label: string }[] = [
  { key: 'psr_score', label: 'Recuperação' },
  { key: 'fatigue_score', label: 'Fadiga' },
  { key: 'sleep_score', label: 'Sono' },
  { key: 'muscle_soreness_score', label: 'Dor muscular' },
  { key: 'stress_score', label: 'Estresse' },
  { key: 'mood_score', label: 'Humor' },
];

/** PSE alta no dia: nota acima de 6 (maior primeiro). */
export const highPseAlerts = (dayPse: PseRecord[]) =>
  dayPse.filter((r) => !r.did_not_train && (r.rpe_score ?? 0) > PSE_LIMIT).sort((a, b) => (b.rpe_score ?? 0) - (a.rpe_score ?? 0));

/** PSR baixa no dia: pelo menos um dos 6 itens abaixo de 5. */
export const lowPsrAlerts = (dayPsr: PsrRecord[]) => dayPsr.filter((r) => PSR_VARIABLES.some((v) => (r[v.key] as number) < PSR_LIMIT));

/** Quem marcou "não treinei" no dia. */
export const notTrainedAlerts = (dayPse: PseRecord[]) => dayPse.filter((r) => r.did_not_train);

// ===================================================================================
// 7. FILTROS DE ATLETAS E PÚBLICO DOS TREINOS (origem: GroupFilter.tsx e src/lib/groups.ts)
// ===================================================================================

export interface AthleteSelection {
  groupIds: string[];
  athleteIds: string[];
}

/** Filtro "Atletas": união dos grupos marcados + atletas marcados. null = todos os atletas. */
export function resolveSelection(sel: AthleteSelection, groups: AthleteGroup[]): Set<string> | null {
  if (sel.groupIds.length === 0 && sel.athleteIds.length === 0) return null;
  const ids = new Set(sel.athleteIds);
  for (const g of groups) if (sel.groupIds.includes(g.id)) g.members.forEach((m) => ids.add(m));
  return ids;
}

/** Aplica o filtro aos registros. Na tela de Carga entram só atletas ATIVOS. */
export const filterBySelection = <T extends { athlete_id: string }>(rows: T[], selected: Set<string> | null) =>
  selected ? rows.filter((r) => selected.has(r.athlete_id)) : rows;

/** O treino é para este atleta? (todos / somente grupos-atletas / todos exceto grupos-atletas) */
export function sessionAppliesTo(session: TrainingSession, athleteId: string, groups: AthleteGroup[]): boolean {
  const audience = session.audience ?? 'todos';
  if (audience === 'todos') return true;
  const targeted =
    (session.target_athlete_ids ?? []).includes(athleteId) ||
    groups.some((g) => (session.target_group_ids ?? []).includes(g.id) && g.members.includes(athleteId));
  return audience === 'incluir' ? targeted : !targeted;
}

/** PSE esperada com filtro: só os treinos destinados a pelo menos um atleta selecionado. */
export const sessionsForSelection = (sessions: TrainingSession[], selected: Set<string> | null, groups: AthleteGroup[]) =>
  selected ? sessions.filter((s) => Array.from(selected).some((a) => sessionAppliesTo(s, a, groups))) : sessions;

/** Duração sugerida na PSE: fim - início do treino do cronograma (em minutos). */
export function sessionMinutes(s: { start_time: string; end_time?: string | null }): number | undefined {
  if (!s.end_time) return undefined;
  const [h1, m1] = s.start_time.split(':').map(Number);
  const [h2, m2] = s.end_time.split(':').map(Number);
  const min = h2 * 60 + m2 - (h1 * 60 + m1);
  return min > 0 ? min : undefined;
}

// ===================================================================================
// 8. RESPOSTAS EM FALTA (origem: src/lib/pseMatch.ts e src/components/coach/MissingResponses.tsx)
// ===================================================================================
//
// Só conta dias com treino no cronograma destinado ao atleta, e só depois do prazo do clube
// (padrão 22:00). Espera-se 1 PSR por dia de treino e 1 PSE por treino.

/**
 * Liga cada treino programado à PSE do mesmo tipo, na ordem do horário (a primeira PSE enviada
 * vai para o primeiro treino). "Não treinei" sem tipo vale para todos os treinos do dia.
 */
export function matchPseToSessions(sessions: TrainingSession[], records: PseRecord[]): Map<string, PseRecord> {
  const ordered = [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const recs = [...records].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const used = new Set<PseRecord>();
  const out = new Map<string, PseRecord>();
  for (const s of ordered) {
    const rec = recs.find((r) => !used.has(r) && !!r.training_type && r.training_type === s.training_type);
    if (rec) {
      used.add(rec);
      out.set(s.id, rec);
    }
  }
  const wholeDay = recs.find((r) => r.did_not_train && !r.training_type);
  if (wholeDay) for (const s of ordered) if (!out.has(s.id)) out.set(s.id, wholeDay);
  return out;
}

export interface MissingRow {
  date: string;
  athleteId: string;
  what: string; // "PSR" ou "PSE • <treino>"
  status: 'faltou' | 'atrasado';
}

/**
 * Lista quem não respondeu (ou respondeu depois do prazo).
 * `sentAt(r)` devolve [data, HH:MM] do envio no horário de Brasília.
 */
export function missingResponses(input: {
  days: string[];
  today: string;
  now: string; // HH:MM
  deadline: string; // HH:MM, padrão "22:00"
  athleteIds: string[]; // atletas ativos já filtrados
  groups: AthleteGroup[];
  sessions: TrainingSession[];
  pse: PseRecord[];
  psr: PsrRecord[];
  sentAt: (createdAt?: string) => [string, string];
}): MissingRow[] {
  const { days, today, now, deadline, athleteIds, groups, sessions, pse, psr, sentAt } = input;
  const late = (date: string, created?: string) => {
    const [d, t] = sentAt(created);
    return d > date || (d === date && t > deadline);
  };
  const out: MissingRow[] = [];
  for (const date of days) {
    if (date > today || (date === today && now < deadline)) continue; // prazo ainda não passou
    const daySessions = sessions.filter((s) => s.date === date);
    if (!daySessions.length) continue;
    for (const a of athleteIds) {
      const mine = daySessions.filter((s) => sessionAppliesTo(s, a, groups));
      if (!mine.length) continue;
      const psrRec = psr.filter((r) => r.athlete_id === a && r.date === date).sort((x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? ''))[0];
      if (!psrRec) out.push({ date, athleteId: a, what: 'PSR', status: 'faltou' });
      else if (late(date, psrRec.created_at)) out.push({ date, athleteId: a, what: 'PSR', status: 'atrasado' });
      const matched = matchPseToSessions(mine, pse.filter((r) => r.athlete_id === a && r.date === date));
      for (const s of mine) {
        const rec = matched.get(s.id);
        if (!rec) out.push({ date, athleteId: a, what: `PSE • ${s.name}`, status: 'faltou' });
        else if (late(date, rec.created_at)) out.push({ date, athleteId: a, what: `PSE • ${s.name}`, status: 'atrasado' });
      }
    }
  }
  return out;
}

// ===================================================================================
// 9. PLANO DE PESO ATÉ A PESAGEM (origem: src/lib/weightPlan.ts) — sem os textos de tela
// ===================================================================================
//
// Quanto o atleta pode estar ACIMA do peso da categoria, conforme a distância até a pesagem:
//   - 14 dias ou mais: até 8% • 7 a 13 dias: até 5% • 1 a 6 dias: até 3% • dia da pesagem: na categoria
// Status:
//   - no_alvo: até 0,05 kg acima da categoria (tolerância de balança)
//   - seguro: dentro do limite da fase
//   - atencao: dentro do limite de agora, mas acima do limite da próxima fase, que começa em até 7 dias
//   - risco: acima do limite da fase (ou acima da categoria no dia da pesagem)

export type WeightPhase = 'longe' | 'semana_anterior' | 'semana_competicao' | 'pesagem';
export type WeightPlanStatus = 'sem_dados' | 'sem_categoria' | 'sem_limite' | 'no_alvo' | 'seguro' | 'atencao' | 'risco' | 'pesagem_passou';

export const WEIGHT_PHASES: { phase: WeightPhase; fromDays: number; maxPercent: number; label: string }[] = [
  { phase: 'longe', fromDays: 14, maxPercent: 8, label: 'longe da competição' },
  { phase: 'semana_anterior', fromDays: 7, maxPercent: 5, label: 'semana anterior à competição' },
  { phase: 'semana_competicao', fromDays: 1, maxPercent: 3, label: 'semana da competição' },
  { phase: 'pesagem', fromDays: 0, maxPercent: 0, label: 'dia da pesagem' },
];

/** Diferença até a qual o atleta já conta como "no peso" (balanças variam uns gramas). */
export const GAP_TOLERANCE = 0.05;

export interface WeightPoint {
  date: string;
  weight: number; // kg
}

const round1 = (v: number) => Math.round(v * 10) / 10;
/** Arredonda PARA BAIXO em 0,1 kg (o limite nunca fica mais folgado que a regra). */
const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;

/** "-66" -> 66; "+100" -> null (categoria sem limite superior). */
export function parseCategoryWeight(categoria?: string | null): number | null {
  const match = /^\s*-\s*(\d+(?:[.,]\d+)?)/.exec(categoria ?? '');
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Fase do plano conforme os dias até a pesagem. */
export function phaseFor(daysToWeighIn: number) {
  return WEIGHT_PHASES.find((p) => daysToWeighIn >= p.fromDays) ?? WEIGHT_PHASES[WEIGHT_PHASES.length - 1];
}

/** Peso máximo da fase: categoria x (1 + %/100), arredondado para baixo. */
const limitFor = (target: number, percent: number) => ({ percent, weight: floor1(target * (1 + percent / 100)) });

/** Limite de um dia (sem pesagem marcada = longe da competição, 8%). */
export function weightLimitFor(targetWeight: number, daysToWeighIn: number | null) {
  const percent = daysToWeighIn === null ? WEIGHT_PHASES[0].maxPercent : phaseFor(daysToWeighIn).maxPercent;
  return limitFor(targetWeight, percent);
}

export function buildWeightPlan(input: {
  currentWeight: number | null | undefined;
  currentDate?: string | null;
  category?: string | null; // ex.: "-66" ou "+100"
  weighInDate: string;
  today: string;
  history?: WeightPoint[];
}) {
  const { currentWeight, currentDate, category, weighInDate, today, history = [] } = input;
  const target = parseCategoryWeight(category);
  const current = currentWeight && currentWeight > 0 ? currentWeight : null;
  const isPlusCategory = /^\s*\+/.test((category ?? '').trim());
  const missingCategory = target === null && !isPlusCategory;
  const daysToWeighIn = daysBetweenISO(today, weighInDate);
  const days = Math.max(0, daysToWeighIn);
  const weeks = days / 7;
  const stale = Boolean(currentDate && daysBetweenISO(currentDate, today) > 14); // pesagem com mais de 14 dias

  const phaseInfo = phaseFor(days);
  const gap = current !== null && target !== null ? current - target : null; // kg acima da categoria
  const gapPercent = gap !== null && target ? (gap / target) * 100 : null;
  const limit = target !== null ? limitFor(target, phaseInfo.maxPercent) : null;

  // Próxima fase com limite menor: começa 13 dias antes da pesagem (semana anterior) ou 6 dias antes (semana da competição)
  const nextPhase = WEIGHT_PHASES.find((p) => p.fromDays < phaseInfo.fromDays && p.phase !== 'pesagem');
  const nextLimit =
    target !== null && nextPhase
      ? { ...limitFor(target, nextPhase.maxPercent), from: addDaysISO(weighInDate, -(nextPhase.phase === 'semana_anterior' ? 13 : 6)) }
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

  // Tendência: primeiro e último peso dos últimos 21 dias (precisam estar a 3+ dias de distância)
  const recent = history
    .filter((p) => Number.isFinite(p.weight) && p.weight > 0 && daysBetweenISO(p.date, today) <= 21)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanDays = first && last ? daysBetweenISO(first.date, last.date) : 0;
  const trendWeeklyRate = first && last && spanDays >= 3 ? ((last.weight - first.weight) / spanDays) * 7 : null; // kg/semana
  const trendWeeklyPercent = trendWeeklyRate !== null && current ? (trendWeeklyRate / current) * 100 : null;
  const projectedWeight = trendWeeklyRate !== null && current !== null && weeks > 0 ? round1(current + trendWeeklyRate * weeks) : null;

  return { target, current, gap, gapPercent, days, phase: phaseInfo.phase, limit, nextLimit, trendWeeklyRate, trendWeeklyPercent, projectedWeight, stale, status };
}

// ===================================================================================
// 10. EXEMPLO (dados inventados) — rode com `npx tsx metricas.ts`
// ===================================================================================

const isMain = typeof process !== 'undefined' && process.argv[1]?.endsWith('metricas.ts');
if (isMain) {
  const ref = '2026-11-04';
  const pse: PseRecord[] = [];
  // 28 dias: Técnico 90 min PSE 5 de segunda a sexta; Randori 60 min PSE 8 às terças e quintas na última semana
  for (let i = 0; i < 28; i++) {
    const date = addDaysISO(ref, -i);
    const weekday = new Date(parseISO(date)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      pse.push({ athlete_id: 'A', date, training_type: 'Treino Técnico', rpe_score: 5, did_not_train: false, duration_minutes: 90 });
    }
    if (i < 7 && (weekday === 2 || weekday === 4)) {
      pse.push({ athlete_id: 'A', date, training_type: 'Treino Randori', rpe_score: 8, did_not_train: false, duration_minutes: 60 });
    }
  }
  const m = loadMetrics(dailyLoads(pse).get('A'), ref, sessionsInWeek(pse, ref).get('A'));
  console.log('Carga:', m);

  const plan = buildWeightPlan({ currentWeight: 69.8, currentDate: ref, category: '-66', weighInDate: addDaysISO(ref, 10), today: ref });
  console.log('Peso (-66, pesagem em 10 dias, 69,8 kg):', plan.status, plan.limit, plan.nextLimit);
}
