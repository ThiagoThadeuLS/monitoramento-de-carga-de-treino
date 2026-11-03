import { deleteById, supabase } from './supabase';
import { AthleteGroup, AthleteRef } from './groups';
import { Competition } from '../types';

export interface AthleteCompetition {
  id: string;
  nome: string;
  data: string;
  data_pesagem: string;
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
  if (/publico_vazio/.test(msg)) return 'Escolha pelo menos um grupo ou atleta para a competição.';
  if (/de_outro_clube/.test(msg)) return 'Grupo ou atleta inválido para este clube.';
  if (/competitions|competition_applies_to|coach_competition_summary|athlete_list_competitions/.test(msg) &&
      /(does not exist|Could not find|schema cache)/.test(msg))
    return 'O módulo de competições ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/duplicate key/.test(msg)) return 'Já existe uma competição com esses dados.';
  if (/row-level security/.test(msg)) return 'Sem permissão para alterar (modo somente leitura?).';
  return `Erro: ${msg}`;
}

/** Competições do clube do treinador logado (RLS por clube). */
export async function listCompetitions(): Promise<Competition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .order('data_pesagem')
    .order('data');
  if (error) throw new Error(competitionError(error));
  return (data ?? []) as Competition[];
}

export async function saveCompetition(competition: Omit<Competition, 'id' | 'created_at' | 'updated_at'> & { id?: string }) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const payload = {
    nome: competition.nome.trim(),
    data: competition.data,
    data_pesagem: competition.data_pesagem,
    hora_pesagem: competition.hora_pesagem || null,
    local: competition.local?.trim() || null,
    observacoes: competition.observacoes?.trim() || null,
    audience: competition.audience ?? 'todos',
    target_group_ids: (competition.audience ?? 'todos') === 'todos' ? [] : competition.target_group_ids ?? [],
    target_athlete_ids: (competition.audience ?? 'todos') === 'todos' ? [] : competition.target_athlete_ids ?? [],
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
  const targeted =
    (competition.target_athlete_ids ?? []).includes(athleteId) ||
    groups.some((g) => (competition.target_group_ids ?? []).includes(g.id) && g.members.includes(athleteId));
  return audience === 'incluir' ? targeted : !targeted;
}

/** Texto curto do público, no mesmo formato usado no cronograma. */
export function competitionAudienceLabel(competition: Competition, groups: AthleteGroup[], athletes: AthleteRef[]): string {
  const audience = competition.audience ?? 'todos';
  if (audience === 'todos') return 'Todos os atletas';
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
