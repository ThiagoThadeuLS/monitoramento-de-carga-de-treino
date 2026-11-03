import { useEffect, useState } from 'react';
import { deleteById, supabase } from './supabase';
import { TrainingSession } from '../types';
import { useClub } from './club';

export interface AthleteGroup {
  id: string;
  nome: string;
  members: string[]; // athlete_id
}

export interface AthleteRef {
  id: string;
  nome: string;
}

export function groupError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  if (/duplicate key|athlete_groups_nome_unico/.test(msg)) return 'Já existe um grupo com esse nome.';
  if (/publico_vazio/.test(msg)) return 'Escolha pelo menos um grupo ou atleta para o treino.';
  if (/de_outro_clube/.test(msg)) return 'Grupo ou atleta inválido para este clube.';
  if (/athlete_groups|athlete_group_members|audience/.test(msg) && /(does not exist|Could not find|schema cache)/.test(msg))
    return 'Os grupos ainda não foram ativados no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/row-level security|nao_autorizado/.test(msg)) return 'Sem permissão para alterar (modo somente leitura?).';
  if (/nome_obrigatorio/.test(msg)) return 'Informe o nome do grupo.';
  if (/club_save_group/.test(msg) && /(Could not find|schema cache)/.test(msg))
    return 'A gravação de grupos foi atualizada. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/Nada foi excluído/.test(msg)) return msg;
  return `Erro: ${msg}`;
}

export async function listGroups(): Promise<AthleteGroup[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('athlete_groups')
    .select('id, nome, athlete_group_members(athlete_id)')
    .order('nome');
  if (error) throw new Error(groupError(error));
  return (data ?? []).map((g: any) => ({
    id: g.id,
    nome: g.nome,
    members: (g.athlete_group_members ?? []).map((m: any) => m.athlete_id),
  }));
}

export async function listActiveAthletes(): Promise<AthleteRef[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('athletes').select('id, nome').eq('active', true).order('nome');
  if (error) throw new Error(groupError(error));
  return data ?? [];
}

/**
 * Cria ou atualiza o grupo e deixa exatamente estes atletas como participantes.
 * Tudo numa função do banco (club_save_group): se algo falhar, nada é gravado.
 * `previous` ficou só por compatibilidade (o banco calcula quem sai e quem entra).
 */
export async function saveGroup(group: { id?: string; nome: string; members: string[] }, _previous: string[] = []) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('club_save_group', {
    p_id: group.id ?? null,
    p_nome: group.nome.trim(),
    p_members: group.members,
  });
  if (error) throw new Error(groupError(error));
  invalidateGroups();
  return data as string;
}

export async function deleteGroup(id: string) {
  try {
    await deleteById('athlete_groups', id);
    invalidateGroups();
  } catch (err) {
    throw new Error(groupError(err));
  }
}

/** Mesma regra do banco (session_applies_to): o treino é para este atleta? */
export function sessionAppliesTo(session: TrainingSession, athleteId: string, groups: AthleteGroup[]): boolean {
  const audience = session.audience ?? 'todos';
  if (audience === 'todos') return true;
  const targeted =
    (session.target_athlete_ids ?? []).includes(athleteId) ||
    groups.some((g) => (session.target_group_ids ?? []).includes(g.id) && g.members.includes(athleteId));
  return audience === 'incluir' ? targeted : !targeted;
}

/** Texto curto do público do treino, ex.: "Pesados, Ana Souza" ou "Exceto: Seleção". */
export function audienceLabel(session: TrainingSession, groups: AthleteGroup[], athletes: AthleteRef[]): string {
  const audience = session.audience ?? 'todos';
  if (audience === 'todos') return 'Todos os atletas';
  const names = [
    ...(session.target_group_ids ?? []).map((id) => groups.find((g) => g.id === id)?.nome ?? 'grupo removido'),
    ...(session.target_athlete_ids ?? []).map((id) => athletes.find((a) => a.id === id)?.nome ?? 'atleta removido'),
  ];
  return audience === 'incluir' ? names.join(', ') : `Todos, exceto: ${names.join(', ')}`;
}

// Grupos guardados por 2 minutos (por clube): trocar de aba não busca de novo
const GROUPS_TTL_MS = 2 * 60 * 1000;
let groupsCache: { club: string; at: number; promise: Promise<AthleteGroup[]> } | null = null;

/** Grupos do clube com cache curto. `force` busca de novo. */
export function listGroupsCached(club: string | null | undefined, force = false): Promise<AthleteGroup[]> {
  const key = club ?? '';
  if (!force && groupsCache && groupsCache.club === key && Date.now() - groupsCache.at < GROUPS_TTL_MS) {
    return groupsCache.promise;
  }
  const promise = listGroups();
  groupsCache = { club: key, at: Date.now(), promise };
  promise.catch(() => {
    if (groupsCache?.promise === promise) groupsCache = null;
  });
  return promise;
}

export function invalidateGroups() {
  groupsCache = null;
}

/** Grupos do clube (com participantes), para filtros e formulários. */
export function useClubGroups(enabled = true) {
  const { club } = useClub();
  const clubId = club?.id ?? null;
  const [groups, setGroups] = useState<AthleteGroup[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listGroupsCached(clubId, version > 0)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [enabled, version, clubId]);
  return { groups, reload: () => setVersion((v) => v + 1) };
}
