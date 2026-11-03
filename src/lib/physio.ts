import { deleteById, supabase } from './supabase';
import { todayISO } from './date';
import { daysBetweenISO } from './weightPlan';

/** Caso de fisioterapia: uma lesão/episódio acompanhado até a alta. */
export type PhysioStatus = 'avaliacao' | 'tratamento' | 'retorno_gradual' | 'alta';
export type PhysioSide = 'direito' | 'esquerdo' | 'bilateral';

export const PHYSIO_STATUS_LABEL: Record<PhysioStatus, string> = {
  avaliacao: 'Em avaliação',
  tratamento: 'Em tratamento',
  retorno_gradual: 'Retorno gradual',
  alta: 'Alta',
};

export const PHYSIO_STATUS_TONE: Record<PhysioStatus, string> = {
  avaliacao: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  tratamento: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  retorno_gradual: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  alta: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export const PHYSIO_STATUS_OPTIONS: { id: PhysioStatus; label: string; hint: string }[] = [
  { id: 'avaliacao', label: 'Em avaliação', hint: 'Primeiras sessões e definição do plano' },
  { id: 'tratamento', label: 'Em tratamento', hint: 'Plano ativo e evolução em andamento' },
  { id: 'retorno_gradual', label: 'Retorno gradual', hint: 'Já treina com restrição e critérios quase completos' },
  { id: 'alta', label: 'Alta', hint: 'Liberado para o treino normal' },
];

export const PHYSIO_SIDE_LABEL: Record<PhysioSide, string> = {
  direito: 'Direito',
  esquerdo: 'Esquerdo',
  bilateral: 'Bilateral',
};

export interface PhysioCase {
  id: string;
  club_id?: string;
  athlete_id: string;
  status: PhysioStatus;
  regiao: string;
  lado?: PhysioSide | null;
  inicio: string;
  previsao_retorno?: string | null;
  retorno_real?: string | null;
  restricao?: string | null;
  observacoes_treinador?: string | null;
  notas_privadas?: string | null;
  block_randori?: boolean | null;
  block_contact?: boolean | null;
  full_rest?: boolean | null;
  allow_physical?: boolean | null;
  allow_technical?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface PhysioCaseInput {
  id?: string;
  athlete_id: string;
  status: PhysioStatus;
  regiao: string;
  lado?: PhysioSide | null;
  inicio: string;
  previsao_retorno?: string | null;
  retorno_real?: string | null;
  restricao?: string | null;
  observacoes_treinador?: string | null;
  notas_privadas?: string | null;
  block_randori?: boolean | null;
  block_contact?: boolean | null;
  full_rest?: boolean | null;
  allow_physical?: boolean | null;
  allow_technical?: boolean | null;
}

export interface PhysioExercise {
  id: string;
  nome: string;
  descricao?: string | null;
  regiao?: string | null;
  created_at?: string;
}

export interface PhysioSession {
  id: string;
  case_id: string;
  date: string;
  dor_repouso?: number | null;
  dor_movimento?: number | null;
  funcao_score?: number | null;
  conduta?: string | null;
  proxima_sessao?: string | null;
  notas?: string | null;
  created_at?: string;
}

export interface PhysioSessionInput {
  id?: string;
  case_id: string;
  date: string;
  dor_repouso?: number | null;
  dor_movimento?: number | null;
  funcao_score?: number | null;
  conduta?: string | null;
  proxima_sessao?: string | null;
  notas?: string | null;
}

export interface PhysioPrescription {
  id: string;
  case_id: string;
  exercise_id?: string | null;
  nome: string;
  series?: string | null;
  repeticoes?: string | null;
  frequencia?: string | null;
  orientacao?: string | null;
  ativo: boolean;
  created_at?: string;
}

export interface PhysioPrescriptionInput {
  id?: string;
  case_id: string;
  exercise_id?: string | null;
  nome: string;
  series?: string | null;
  repeticoes?: string | null;
  frequencia?: string | null;
  orientacao?: string | null;
  ativo?: boolean;
}

export interface PhysioCriterion {
  id: string;
  case_id: string;
  descricao: string;
  cumprido: boolean;
  cumprido_em?: string | null;
  ordem: number;
  created_at?: string;
}

export interface PhysioCheckin {
  id: string;
  case_id: string;
  athlete_id: string;
  prescription_id: string;
  date: string;
  done: boolean;
  dor_antes?: number | null;
  dor_depois?: number | null;
  observacao?: string | null;
  created_at?: string;
}

/** Resumo compartilhado com o treinador (não inclui notas privadas). */
export interface PhysioSummary {
  case_id: string;
  athlete_id: string;
  athlete_nome: string;
  classe?: string | null;
  categoria?: string | null;
  status: PhysioStatus;
  regiao: string;
  lado?: PhysioSide | null;
  inicio: string;
  previsao_retorno?: string | null;
  retorno_real?: string | null;
  restricao?: string | null;
  observacoes_treinador?: string | null;
  dor_ultima?: number | null;
  dor_movimento_ultima?: number | null;
  ultima_sessao?: string | null;
  criterios_total: number;
  criterios_cumpridos: number;
  prescricoes_ativas: number;
}

export interface CoachPhysioCaseDetail {
  case: {
    id: string;
    athlete_id: string;
    athlete_nome: string;
    classe?: string | null;
    categoria?: string | null;
    status: PhysioStatus;
    regiao: string;
    lado?: PhysioSide | null;
    inicio: string;
    previsao_retorno?: string | null;
    retorno_real?: string | null;
    restricao?: string | null;
    observacoes_treinador?: string | null;
  };
  sessions: { date: string; dor_repouso?: number | null; dor_movimento?: number | null; funcao_score?: number | null }[];
  criteria: { id: string; descricao: string; cumprido: boolean; cumprido_em?: string | null }[];
  prescriptions: {
    id: string;
    nome: string;
    series?: string | null;
    repeticoes?: string | null;
    frequencia?: string | null;
    orientacao?: string | null;
  }[];
}

export interface AthletePhysioCase {
  id: string;
  status: PhysioStatus;
  regiao: string;
  lado?: PhysioSide | null;
  inicio: string;
  previsao_retorno?: string | null;
  restricao?: string | null;
}

export interface AthletePhysioPrescription {
  id: string;
  nome: string;
  series?: string | null;
  repeticoes?: string | null;
  frequencia?: string | null;
  orientacao?: string | null;
}

export interface AthletePhysioCheckin {
  prescription_id: string;
  date: string;
  done: boolean;
  dor_antes?: number | null;
  dor_depois?: number | null;
  observacao?: string | null;
}

export interface AthletePhysioPainPoint {
  date: string;
  dor_repouso?: number | null;
  dor_movimento?: number | null;
}

export interface AthletePhysio {
  today: string;
  case: AthletePhysioCase | null;
  criteria: { id: string; descricao: string; cumprido: boolean }[];
  prescriptions: AthletePhysioPrescription[];
  checkins: AthletePhysioCheckin[];
  painHistory: AthletePhysioPainPoint[];
}

export type PhysioReturnState = 'sem_previsao' | 'no_prazo' | 'atencao' | 'atrasado' | 'alta';

export interface PhysioReturnInfo {
  state: PhysioReturnState;
  label: string;
  days: number | null;
}

export const PHYSIO_RETURN_TONE: Record<PhysioReturnState, string> = {
  sem_previsao: 'bg-slate-800 text-slate-300 border-slate-700',
  no_prazo: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  atencao: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  atrasado: 'bg-red-500/10 text-red-300 border-red-500/30',
  alta: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

const br = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

export function formatPhysioRegion(regiao: string, lado?: PhysioSide | null): string {
  return lado ? `${regiao} • ${PHYSIO_SIDE_LABEL[lado].toLowerCase()}` : regiao;
}

/** Situação da previsão de retorno: prazo, atenção, atrasado ou alta. */
export function physioReturnInfo(
  c: { status: PhysioStatus; previsao_retorno?: string | null; retorno_real?: string | null },
  today = todayISO()
): PhysioReturnInfo {
  if (c.status === 'alta') {
    return { state: 'alta', label: c.retorno_real ? `Alta em ${br(c.retorno_real)}` : 'Alta', days: null };
  }
  if (!c.previsao_retorno) return { state: 'sem_previsao', label: 'Sem previsão', days: null };
  const days = daysBetweenISO(today, c.previsao_retorno);
  if (days < 0) return { state: 'atrasado', label: `Atrasado ${Math.abs(days)}d`, days };
  if (days === 0) return { state: 'atencao', label: 'Previsão hoje', days: 0 };
  if (days <= 7) return { state: 'atencao', label: `Faltam ${days}d`, days };
  return { state: 'no_prazo', label: `Faltam ${days}d`, days };
}

export function criteriaProgress(criteria: { cumprido: boolean }[]): { done: number; total: number; pct: number } {
  const total = criteria.length;
  const done = criteria.filter((c) => c.cumprido).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function physioError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  if (/physio_|coach_physio|athlete_physio/.test(msg) && /(does not exist|Could not find|schema cache)/.test(msg))
    return 'O módulo de fisioterapia ainda não foi ativado no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/physio_cases_um_ativo|duplicate key/.test(msg))
    return 'Este atleta já tem um caso ativo. Conclua ou abra um novo caso depois da alta.';
  if (/row-level security|nao_autorizado/.test(msg)) return 'Sem permissão para esta ação.';
  if (/atleta_invalido/.test(msg)) return 'Atleta inválido para este clube.';
  if (/registro_nao_encontrado/.test(msg)) return 'Registro não encontrado. Ele pode ter sido removido.';
  if (/dor_invalida/.test(msg)) return 'A dor precisa ficar entre 0 e 10.';
  if (/nome_obrigatorio/.test(msg)) return 'Informe o nome do exercício.';
  if (/Nada foi excluído/.test(msg)) return msg;
  return `Erro: ${msg}`;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

// ---------------------------------------------------------------------------
// Casos (fisioterapeuta)
// ---------------------------------------------------------------------------

export async function listPhysioCases(): Promise<PhysioCase[]> {
  const { data, error } = await db().from('physio_cases').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioCase[];
}

export async function getPhysioCase(id: string): Promise<PhysioCase | null> {
  const { data, error } = await db().from('physio_cases').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(physioError(error));
  return (data as PhysioCase) ?? null;
}

export async function savePhysioCase(input: PhysioCaseInput): Promise<PhysioCase> {
  const payload = {
    athlete_id: input.athlete_id,
    status: input.status,
    regiao: input.regiao.trim(),
    lado: input.lado ?? null,
    inicio: input.inicio,
    previsao_retorno: input.previsao_retorno || null,
    retorno_real: input.status === 'alta' ? input.retorno_real || todayISO() : null,
    restricao: input.restricao?.trim() || null,
    observacoes_treinador: input.observacoes_treinador?.trim() || null,
    notas_privadas: input.notas_privadas?.trim() || null,
    block_randori: input.block_randori ?? true,
    block_contact: input.block_contact ?? true,
    full_rest: input.full_rest ?? false,
    allow_physical: input.allow_physical ?? true,
    allow_technical: input.allow_technical ?? true,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? db().from('physio_cases').update(payload).eq('id', input.id)
    : db().from('physio_cases').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(physioError(error));
  return data as PhysioCase;
}

export async function deletePhysioCase(id: string): Promise<void> {
  try {
    await deleteById('physio_cases', id);
  } catch (err) {
    throw new Error(physioError(err));
  }
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

export async function listPhysioSessions(caseId: string): Promise<PhysioSession[]> {
  const { data, error } = await db()
    .from('physio_sessions')
    .select('*')
    .eq('case_id', caseId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioSession[];
}

export async function savePhysioSession(input: PhysioSessionInput): Promise<PhysioSession> {
  const payload = {
    case_id: input.case_id,
    date: input.date,
    dor_repouso: input.dor_repouso ?? null,
    dor_movimento: input.dor_movimento ?? null,
    funcao_score: input.funcao_score ?? null,
    conduta: input.conduta?.trim() || null,
    proxima_sessao: input.proxima_sessao || null,
    notas: input.notas?.trim() || null,
  };
  const query = input.id
    ? db().from('physio_sessions').update(payload).eq('id', input.id)
    : db().from('physio_sessions').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(physioError(error));
  return data as PhysioSession;
}

export async function deletePhysioSession(id: string): Promise<void> {
  try {
    await deleteById('physio_sessions', id);
  } catch (err) {
    throw new Error(physioError(err));
  }
}

// ---------------------------------------------------------------------------
// Catálogo e plano de exercícios
// ---------------------------------------------------------------------------

export async function listPhysioExercises(): Promise<PhysioExercise[]> {
  const { data, error } = await db().from('physio_exercises').select('*').order('nome');
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioExercise[];
}

async function ensurePhysioExercise(nome: string): Promise<string | null> {
  const clean = nome.trim();
  if (!clean) return null;
  try {
    const { data } = await db()
      .from('physio_exercises')
      .select('id')
      .ilike('nome', clean)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
    const { data: created } = await db().from('physio_exercises').insert({ nome: clean }).select('id').single();
    return created?.id ?? null;
  } catch {
    // Catálogo é conveniência: se falhar, o plano ainda guarda o nome do exercício.
    return null;
  }
}

export async function listPhysioPrescriptions(caseId: string): Promise<PhysioPrescription[]> {
  const { data, error } = await db()
    .from('physio_prescriptions')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioPrescription[];
}

export async function savePhysioPrescription(input: PhysioPrescriptionInput): Promise<PhysioPrescription> {
  const nome = input.nome.trim();
  const exerciseId = input.exercise_id ?? (await ensurePhysioExercise(nome));
  const payload = {
    case_id: input.case_id,
    exercise_id: exerciseId,
    nome,
    series: input.series?.trim() || null,
    repeticoes: input.repeticoes?.trim() || null,
    frequencia: input.frequencia?.trim() || null,
    orientacao: input.orientacao?.trim() || null,
    ativo: input.ativo ?? true,
  };
  const query = input.id
    ? db().from('physio_prescriptions').update(payload).eq('id', input.id)
    : db().from('physio_prescriptions').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(physioError(error));
  return data as PhysioPrescription;
}

export async function deletePhysioPrescription(id: string): Promise<void> {
  try {
    await deleteById('physio_prescriptions', id);
  } catch (err) {
    throw new Error(physioError(err));
  }
}

// ---------------------------------------------------------------------------
// Critérios de retorno
// ---------------------------------------------------------------------------

export async function listPhysioCriteria(caseId: string): Promise<PhysioCriterion[]> {
  const { data, error } = await db()
    .from('physio_criteria')
    .select('*')
    .eq('case_id', caseId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioCriterion[];
}

export async function savePhysioCriterion(input: {
  id?: string;
  case_id: string;
  descricao: string;
  cumprido?: boolean;
  ordem?: number;
}): Promise<PhysioCriterion> {
  const payload = {
    case_id: input.case_id,
    descricao: input.descricao.trim(),
    cumprido: input.cumprido ?? false,
    cumprido_em: input.cumprido ? todayISO() : null,
    ordem: input.ordem ?? 0,
  };
  const query = input.id
    ? db().from('physio_criteria').update(payload).eq('id', input.id)
    : db().from('physio_criteria').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(physioError(error));
  return data as PhysioCriterion;
}

export async function setPhysioCriterionDone(id: string, done: boolean): Promise<void> {
  const { error } = await db()
    .from('physio_criteria')
    .update({ cumprido: done, cumprido_em: done ? todayISO() : null })
    .eq('id', id);
  if (error) throw new Error(physioError(error));
}

export async function deletePhysioCriterion(id: string): Promise<void> {
  try {
    await deleteById('physio_criteria', id);
  } catch (err) {
    throw new Error(physioError(err));
  }
}

// ---------------------------------------------------------------------------
// Check-ins do atleta
// ---------------------------------------------------------------------------

export async function listPhysioCheckins(caseId: string, limit = 60): Promise<PhysioCheckin[]> {
  const { data, error } = await db()
    .from('physio_checkins')
    .select('*')
    .eq('case_id', caseId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(physioError(error));
  return (data ?? []) as PhysioCheckin[];
}

// ---------------------------------------------------------------------------
// Visão do treinador (RPCs sem notas privadas)
// ---------------------------------------------------------------------------

export async function coachPhysioSummary(): Promise<PhysioSummary[]> {
  const { data, error } = await db().rpc('coach_physio_summary');
  if (error) throw new Error(physioError(error));
  return ((data ?? []) as PhysioSummary[]).map((r) => ({
    ...r,
    criterios_total: Number(r.criterios_total ?? 0),
    criterios_cumpridos: Number(r.criterios_cumpridos ?? 0),
    prescricoes_ativas: Number(r.prescricoes_ativas ?? 0),
  }));
}

export async function coachPhysioCaseDetail(caseId: string): Promise<CoachPhysioCaseDetail | null> {
  const { data, error } = await db().rpc('coach_physio_case_detail', { p_case_id: caseId });
  if (error) throw new Error(physioError(error));
  return (data as CoachPhysioCaseDetail) ?? null;
}

// ---------------------------------------------------------------------------
// Visão do atleta (token)
// ---------------------------------------------------------------------------

export async function getAthletePhysio(token: string): Promise<AthletePhysio | null> {
  const { data, error } = await db().rpc('athlete_physio', { p_token: token });
  if (error) throw new Error(physioError(error));
  const d = (data ?? {}) as any;
  if (!d.case) return null;
  return {
    today: d.today,
    case: d.case,
    criteria: d.criteria ?? [],
    prescriptions: d.prescriptions ?? [],
    checkins: d.checkins ?? [],
    painHistory: d.pain_history ?? [],
  };
}

export async function checkinAthletePhysio(
  token: string,
  input: {
    prescriptionId: string;
    done?: boolean;
    dorAntes?: number | null;
    dorDepois?: number | null;
    observacao?: string | null;
  }
): Promise<void> {
  const { error } = await db().rpc('athlete_physio_checkin', {
    p_token: token,
    p_prescription_id: input.prescriptionId,
    p_done: input.done ?? true,
    p_dor_antes: input.dorAntes ?? null,
    p_dor_depois: input.dorDepois ?? null,
    p_observacao: input.observacao?.trim() || null,
  });
  if (error) throw new Error(physioError(error));
}
