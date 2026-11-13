import { deleteById, supabase } from './supabase';
import { AthleteGroup, AthleteRef } from './groups';
import { Competition } from '../types';
import {
  AthleteCompetitionResult,
  CompetitionPlacement,
  CompetitionResult,
  CompetitionResultOverviewRow,
  parseCompetitionPlacement,
} from './competitionResults';

export * from './competitionResults';

export interface AthleteCompetition {
  id: string;
  nome: string;
  /** 'campo' = treinamento de campo (sem pesagem) */
  tipo?: 'competicao' | 'campo';
  data: string;
  data_fim?: string | null;
  data_pesagem: string | null;
  hora_pesagem?: string | null;
  local?: string | null;
  observacoes?: string | null;
  categoria?: string | null;
  peso_atual?: number | null;
  peso_data?: string | null;
}

export interface CompetitionSummaryRow {
  athlete_id: string;
  nome: string;
  categoria?: string | null;
  classe?: string | null;
  peso_atual?: number | null;
  peso_data?: string | null;
}

function competitionError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  if (/competitions_tipo_check|column .*(tipo|data_fim)|data_pesagem.*not-null|null value in column "data_pesagem"/.test(msg))
    return 'O treinamento de campo ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/competitions_audience_check/.test(msg))
    return 'A opção "Ninguém" ainda não foi ativada no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/publico_vazio/.test(msg)) return 'Escolha pelo menos um grupo ou atleta para a competição.';
  if (/de_outro_clube/.test(msg)) return 'Grupo ou atleta inválido para este clube.';
  if (/competition_results|athlete_list_competition_results|athlete_save_competition_result|coach_competition_results_overview/.test(msg) &&
      /(does not exist|Could not find|schema cache)/.test(msg))
    return 'O módulo de resultados de competições ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/competitions|competition_applies_to|coach_competition_summary|athlete_list_competitions/.test(msg) &&
      /(does not exist|Could not find|schema cache)/.test(msg))
    return 'O módulo de competições ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/competicao_nao_encontrada/.test(msg)) return 'Competição não encontrada.';
  if (/competicao_futura/.test(msg)) return 'O resultado só pode ser registrado depois da competição.';
  if (/colocacao_invalida/.test(msg)) return 'Colocação inválida.';
  if (/estatisticas_incompletas/.test(msg)) return 'Preencha lutas, vitórias e derrotas (ou deixe os três em branco).';
  if (/estatisticas_invalidas/.test(msg)) return 'Confira os números de lutas, vitórias e derrotas.';
  if (/nao_autorizado/.test(msg)) return 'Sem permissão para registrar este resultado.';
  if (/duplicate key/.test(msg)) return 'Já existe uma competição com esses dados.';
  if (/row-level security/.test(msg)) return 'Sem permissão para alterar (modo somente leitura?).';
  return `Erro: ${msg}`;
}

function integerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeCompetitionResult(value: unknown): CompetitionResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    colocacao: parseCompetitionPlacement(row.colocacao),
    lutas: integerOrNull(row.lutas),
    vitorias: integerOrNull(row.vitorias),
    derrotas: integerOrNull(row.derrotas),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

/** Treinamento de campo (sem pesagem, com início e fim)? */
export const isFieldTraining = (c: { tipo?: string | null }) => c.tipo === 'campo';

/** Último dia do evento: fim do treinamento de campo ou a data da competição. */
export const eventEndDate = (c: { data: string; data_fim?: string | null }) => c.data_fim || c.data;

/** Data que conta para a contagem regressiva: pesagem da competição ou início do treinamento de campo. */
export const eventKeyDate = (c: { data: string; data_pesagem?: string | null }) => c.data_pesagem || c.data;

/** "01/12 a 05/12" (ou só "01/12" quando é um dia). */
export const fieldTrainingRange = (c: { data: string; data_fim?: string | null }) => {
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return c.data_fim && c.data_fim !== c.data ? `${br(c.data)} a ${br(c.data_fim)}` : br(c.data);
};

/** Competições e treinamentos de campo do clube do treinador logado (RLS por clube). */
export async function listCompetitions(): Promise<Competition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .order('data')
    .order('nome');
  if (error) throw new Error(competitionError(error));
  return (data ?? []) as Competition[];
}

/** "Todos" e "Ninguém" não usam lista de grupos/atletas. */
const semLista = (audience: Competition['audience']) => (audience ?? 'todos') === 'todos' || audience === 'ninguem';

export async function saveCompetition(competition: Omit<Competition, 'id' | 'created_at' | 'updated_at'> & { id?: string }) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const campo = isFieldTraining(competition);
  // Só manda as colunas novas quando o tipo é conhecido (treinamento de campo ou registro lido de um
  // banco que já tem a coluna): a competição continua funcionando num banco sem a parte nova do SQL
  const payload = {
    nome: competition.nome.trim(),
    ...(competition.tipo ? { tipo: competition.tipo, data_fim: campo ? competition.data_fim || null : null } : {}),
    data: competition.data,
    data_pesagem: campo ? null : competition.data_pesagem,
    hora_pesagem: campo ? null : competition.hora_pesagem || null,
    local: competition.local?.trim() || null,
    observacoes: competition.observacoes?.trim() || null,
    audience: competition.audience ?? 'todos',
    target_group_ids: semLista(competition.audience) ? [] : competition.target_group_ids ?? [],
    target_athlete_ids: semLista(competition.audience) ? [] : competition.target_athlete_ids ?? [],
  };
  const { error } = competition.id
    ? await supabase.from('competitions').update(payload).eq('id', competition.id)
    : await supabase.from('competitions').insert([payload]);
  if (error) throw new Error(competitionError(error));
}

export async function deleteCompetition(id: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  // Confere se apagou mesmo (com RLS, exclusão bloqueada não dá erro)
  await deleteById('competitions', id);
}

/** Mesma regra do público dos treinos (session_applies_to), aplicada à competição. */
export function competitionAppliesTo(competition: Competition, athleteId: string, groups: AthleteGroup[]): boolean {
  const audience = competition.audience ?? 'todos';
  if (audience === 'todos') return true;
  if (audience === 'ninguem') return false;
  const targeted =
    (competition.target_athlete_ids ?? []).includes(athleteId) ||
    groups.some((g) => (competition.target_group_ids ?? []).includes(g.id) && g.members.includes(athleteId));
  return audience === 'incluir' ? targeted : !targeted;
}

/** Texto curto do público, no mesmo formato usado no cronograma. */
export function competitionAudienceLabel(competition: Competition, groups: AthleteGroup[], athletes: AthleteRef[]): string {
  const audience = competition.audience ?? 'todos';
  if (audience === 'todos') return 'Todos os atletas';
  if (audience === 'ninguem') return 'Ninguém ainda (sem convocação)';
  const names = [
    ...(competition.target_group_ids ?? []).map((id) => groups.find((g) => g.id === id)?.nome ?? 'grupo removido'),
    ...(competition.target_athlete_ids ?? []).map((id) => athletes.find((a) => a.id === id)?.nome ?? 'atleta removido'),
  ];
  return audience === 'incluir' ? names.join(', ') : `Todos, exceto: ${names.join(', ')}`;
}

/** Atletas do público da competição + última pesagem (para a visão do treinador). */
export async function getCompetitionSummary(competitionId: string): Promise<CompetitionSummaryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('coach_competition_summary', { p_competition_id: competitionId });
  if (error) throw new Error(competitionError(error));
  return ((data ?? []) as CompetitionSummaryRow[]).map((row) => ({
    ...row,
    peso_atual: row.peso_atual === null || row.peso_atual === undefined ? null : Number(row.peso_atual),
  }));
}

/** Competições destinadas ao atleta logado (somente leitura, validadas por token). */
export async function listAthleteCompetitions(token: string): Promise<AthleteCompetition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('athlete_list_competitions', { p_token: token });
  if (error) throw new Error(competitionError(error));
  return ((data ?? []) as AthleteCompetition[]).map((row) => ({
    ...row,
    peso_atual: row.peso_atual === null || row.peso_atual === undefined ? null : Number(row.peso_atual),
  }));
}

/** Competições do atleta com o resultado (ou null quando ainda não registrou). */
export async function listAthleteCompetitionResults(token: string): Promise<AthleteCompetitionResult[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('athlete_list_competition_results', { p_token: token });
  if (error) throw new Error(competitionError(error));
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    competition_id: String(row.competition_id ?? ''),
    nome: String(row.nome ?? ''),
    data: String(row.data ?? ''),
    data_pesagem: String(row.data_pesagem ?? row.data ?? ''),
    local: (row.local as string | null | undefined) ?? null,
    categoria: (row.categoria as string | null | undefined) ?? null,
    result: normalizeCompetitionResult(row.result),
  }));
}

export interface CompetitionResultInput {
  colocacao: CompetitionPlacement | null;
  lutas: number | null;
  vitorias: number | null;
  derrotas: number | null;
}

/** O atleta registra ou edita o resultado da própria competição (nunca apaga). */
export async function saveAthleteCompetitionResult(
  token: string,
  competitionId: string,
  input: CompetitionResultInput
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('athlete_save_competition_result', {
    p_token: token,
    p_competition_id: competitionId,
    p_colocacao: input.colocacao,
    p_lutas: input.lutas,
    p_vitorias: input.vitorias,
    p_derrotas: input.derrotas,
  });
  if (error) throw new Error(competitionError(error));
}

/** Resultados de todas as competições do clube (visão da comissão técnica). */
export async function listCompetitionResultsOverview(): Promise<CompetitionResultOverviewRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('coach_competition_results_overview');
  if (error) throw new Error(competitionError(error));
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    athlete_id: String(row.athlete_id ?? ''),
    athlete_nome: String(row.athlete_nome ?? ''),
    competition_id: String(row.competition_id ?? ''),
    competition_nome: String(row.competition_nome ?? ''),
    competition_data: String(row.competition_data ?? ''),
    colocacao: parseCompetitionPlacement(row.colocacao),
    lutas: integerOrNull(row.lutas),
    vitorias: integerOrNull(row.vitorias),
    derrotas: integerOrNull(row.derrotas),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }));
}
