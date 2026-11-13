import { addDaysISO } from './date';
import type { StoryCard } from './storyCard';

/** Colocações usadas no judô: 1º, 2º, 3º (dois bronzes), 5º e 7º. */
export const COMPETITION_PLACEMENTS = [1, 2, 3, 5, 7] as const;
export type CompetitionPlacement = (typeof COMPETITION_PLACEMENTS)[number];

export interface CompetitionResult {
  id: string;
  /** null = competiu, mas ficou sem colocação. */
  colocacao: CompetitionPlacement | null;
  lutas: number | null;
  vitorias: number | null;
  derrotas: number | null;
  updated_at?: string | null;
}

/** Competição passada com o resultado do atleta (result null = ainda não registrou). */
export interface AthleteCompetitionResult {
  competition_id: string;
  nome: string;
  data: string;
  data_pesagem: string;
  local?: string | null;
  categoria?: string | null;
  result: CompetitionResult | null;
}

/** Uma linha por atleta/competição, para as contas da comissão técnica. */
export interface CompetitionResultOverviewRow {
  athlete_id: string;
  athlete_nome: string;
  competition_id: string;
  competition_nome: string;
  competition_data: string;
  colocacao: CompetitionPlacement | null;
  lutas: number | null;
  vitorias: number | null;
  derrotas: number | null;
  updated_at?: string | null;
}

export interface CompetitionResultStats {
  total: number;
  comColocacao: number;
  semColocacao: number;
  porColocacao: Record<CompetitionPlacement, number>;
  lutas: number;
  vitorias: number;
  derrotas: number;
  /** Vitórias / lutas decididas (null quando ninguém informou lutas). */
  aproveitamento: number | null;
}

export const PLACEMENT_LABEL: Record<CompetitionPlacement, string> = {
  1: '1º lugar',
  2: '2º lugar',
  3: '3º lugar',
  5: '5º lugar',
  7: '7º lugar',
};

export const PLACEMENT_SHORT: Record<CompetitionPlacement, string> = {
  1: '1º',
  2: '2º',
  3: '3º',
  5: '5º',
  7: '7º',
};

export const PLACEMENT_EMOJI: Record<CompetitionPlacement, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
  5: '🏅',
  7: '🏅',
};

/** Título curto do cartão de compartilhar. */
export const PLACEMENT_STORY_TITLE: Record<CompetitionPlacement, string> = {
  1: 'CAMPEÃO',
  2: 'VICE-CAMPEÃO',
  3: '3º LUGAR',
  5: '5º LUGAR',
  7: '7º LUGAR',
};

export function isCompetitionPlacement(value: unknown): value is CompetitionPlacement {
  return value === 1 || value === 2 || value === 3 || value === 5 || value === 7;
}

/** Aceita número ou texto vindo do banco; qualquer outro valor vira "sem colocação". */
export function parseCompetitionPlacement(value: unknown): CompetitionPlacement | null {
  const n = typeof value === 'number' ? value : Number(value);
  return isCompetitionPlacement(n) ? n : null;
}

/** Como o atleta vê o resultado sem colocação (competiu, mas não subiu ao pódio). */
export const NO_PLACEMENT_LABEL = 'Dessa vez não deu';

export function competitionPlacementLabel(value: CompetitionPlacement | null | undefined): string {
  return isCompetitionPlacement(value) ? PLACEMENT_LABEL[value] : NO_PLACEMENT_LABEL;
}

/** Cartão de Stories do resultado. "Sem colocação" não gera cartão (só a mensagem de apoio no app). */
export function competitionResultStoryCard(row: AthleteCompetitionResult): Extract<StoryCard, { kind: 'resultado' }> | null {
  const result = row.result;
  if (!result || !isCompetitionPlacement(result.colocacao)) return null;
  return {
    kind: 'resultado',
    nome: row.nome,
    data: row.data,
    local: row.local,
    categoria: row.categoria,
    colocacao: result.colocacao,
    lutas: result.lutas,
    vitorias: result.vitorias,
    derrotas: result.derrotas,
  };
}

const emptyPlacementCount = (): Record<CompetitionPlacement, number> => ({ 1: 0, 2: 0, 3: 0, 5: 0, 7: 0 });

export function summarizeCompetitionResults(rows: CompetitionResultOverviewRow[]): CompetitionResultStats {
  const porColocacao = emptyPlacementCount();
  let total = 0;
  let semColocacao = 0;
  let lutas = 0;
  let vitorias = 0;
  let derrotas = 0;

  for (const row of rows) {
    total += 1;
    if (isCompetitionPlacement(row.colocacao)) porColocacao[row.colocacao] += 1;
    else semColocacao += 1;
    lutas += row.lutas ?? 0;
    vitorias += row.vitorias ?? 0;
    derrotas += row.derrotas ?? 0;
  }

  const decididas = vitorias + derrotas;
  return {
    total,
    comColocacao: total - semColocacao,
    semColocacao,
    porColocacao,
    lutas,
    vitorias,
    derrotas,
    aproveitamento: decididas > 0 ? vitorias / decididas : null,
  };
}

export function competitionResultStatsBy(
  rows: CompetitionResultOverviewRow[],
  key: 'competition_id' | 'athlete_id'
): Map<string, CompetitionResultStats> {
  const grouped = new Map<string, CompetitionResultOverviewRow[]>();
  for (const row of rows) {
    const id = row[key];
    const list = grouped.get(id);
    if (list) list.push(row);
    else grouped.set(id, [row]);
  }
  return new Map([...grouped.entries()].map(([id, list]) => [id, summarizeCompetitionResults(list)]));
}

/** Competições passadas (com ou sem resultado), da mais recente para a mais antiga. */
export function pastCompetitionResults(rows: AthleteCompetitionResult[], today: string): AthleteCompetitionResult[] {
  return rows.filter((row) => row.data <= today).sort((a, b) => b.data.localeCompare(a.data));
}

/** Resultados que ainda faltam registrar. No "Hoje", usa uma janela curta para não virar cobrança eterna. */
export function pendingCompetitionResults(
  rows: AthleteCompetitionResult[],
  today: string,
  days = 60
): AthleteCompetitionResult[] {
  const min = addDaysISO(today, -days);
  return rows
    .filter((row) => !row.result && row.data <= today && row.data >= min)
    .sort((a, b) => b.data.localeCompare(a.data));
}
