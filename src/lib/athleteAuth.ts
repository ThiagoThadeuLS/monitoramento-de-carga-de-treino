import { supabase } from './supabase';
import { onlyCpfDigits } from './cpf';
import type { ClubInfo } from './club';
import { PseRecord, PsrRecord, TrainingSession, WeightRecord } from '../types';

// Login do atleta: CPF + senha, validados por funções no banco
// (ver supabase_completo.sql). Atletas não usam o Supabase Auth,
// que fica reservado à comissão técnica.

export interface AthleteSession {
  token: string;
  mustChangePassword: boolean;
  athlete: {
    id: string;
    nome: string;
    classe?: string | null;
    categoria?: string | null;
    photo_url?: string | null;
  };
  club: ClubInfo | null;
  /** Termo de uso aceito (vem junto com a sessão; ausente em bancos antigos) */
  terms?: { accepted_at: string | null; version: string | null };
  /** Ainda não viu o tutorial (ausente em bancos antigos) */
  tutorialPending?: boolean;
}

const TOKEN_KEY = 'athlete_session_token';

const ERROR_MESSAGES: Record<string, string> = {
  credenciais_invalidas: 'CPF ou senha incorretos. Confira os dados ou fale com seu treinador.',
  muitas_tentativas: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo, ou fale com seu treinador.',
  sessao_invalida: 'Sua sessão expirou. Entre novamente.',
  troca_de_senha_pendente: 'Você precisa criar sua nova senha antes de enviar respostas.',
  senha_curta: 'A nova senha precisa ter pelo menos 6 caracteres.',
  senha_igual_inicial: 'A nova senha não pode ser igual à senha inicial (seu nome completo).',
  senha_ja_definida: 'Sua senha já foi definida. Entre novamente com ela.',
  pse_motivo_nao_treinou: 'Informe o motivo de não ter treinado.',
  pse_duracao_valida: 'A duração precisa ficar entre 1 e 600 minutos.',
  termo_pendente: 'Você precisa aceitar o termo de uso dos dados antes de continuar.',
  fora_do_prazo: 'Só dá para corrigir respostas enviadas hoje.',
  registro_nao_encontrado: 'Registro não encontrado.',
  nao_autorizado: 'Você só pode alterar o que você mesmo cadastrou.',
  adversario_incompleto: 'Preencha nome, categoria de peso e origem.',
  adversario_invalido: 'Confira os dados do adversário (nome e origem com até 120 caracteres).',
  observacao_vazia: 'Escreva a observação antes de enviar.',
  observacao_longa: 'A observação pode ter até 2000 caracteres.',
  psr_ja_enviado: 'Você já respondeu o bem-estar (PSR) hoje. Para corrigir, apague a resposta de hoje no Histórico e envie de novo.',
  peso_ja_enviado: 'Você já registrou o peso hoje. Para corrigir, apague o registro de hoje no Histórico e envie de novo.',
  pr_invalido: 'Informe uma carga maior que zero e de até 500 kg.',
  exercicio_invalido: 'Esse exercício não está no catálogo do clube (ou não pede PR).',
  foto_invalida: 'Não foi possível ler a foto. Tente outra imagem (JPG, PNG ou WEBP).',
  foto_grande: 'A foto ficou grande demais. Tente outra imagem.',
  foto_sem_servidor: 'O envio de fotos ainda não foi ativado no servidor. Avise a comissão técnica.',
  falha_servidor: 'Não foi possível salvar a foto agora. Tente de novo em instantes.',
  'duplicate key': 'Esse registro já existe.',
};

export class AthleteAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function toAuthError(error: { message?: string } | null): AthleteAuthError {
  const code = Object.keys(ERROR_MESSAGES).find((c) => error?.message?.includes(c));
  if (code) return new AthleteAuthError(code, ERROR_MESSAGES[code]);
  if (error?.message?.includes('Could not find the function')) {
    return new AthleteAuthError(
      'migracao_pendente',
      'O login de atletas ainda não foi ativado no banco. Avise a comissão técnica.'
    );
  }
  return new AthleteAuthError('erro', 'Falha na comunicação com o servidor. Tente novamente.');
}

function client() {
  if (!supabase) {
    throw new AthleteAuthError('sem_supabase', 'Supabase não configurado. Verifique o arquivo .env.');
  }
  return supabase;
}

function parseSession(data: any): AthleteSession {
  return {
    token: data.token,
    mustChangePassword: Boolean(data.must_change_password),
    athlete: data.athlete,
    club: data.club ?? null,
    terms: data.terms ?? undefined,
    tutorialPending: typeof data.tutorial_pending === 'boolean' ? data.tutorial_pending : undefined,
  };
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    // Seleção de atleta da versão sem login (não é mais usada)
    localStorage.removeItem('last_selected_athlete_id');
  } catch {
    // navegador sem localStorage: a sessão só dura até fechar a aba
  }
}

export async function loginAthlete(cpf: string, password: string): Promise<AthleteSession> {
  const { data, error } = await client().rpc('athlete_login', {
    p_cpf: onlyCpfDigits(cpf),
    p_password: password,
  });
  if (error || !data) throw toAuthError(error);
  // Senha errada e bloqueio por tentativas vêm como resposta { erro } (o banco registra a tentativa)
  const erro = (data as { erro?: string }).erro;
  if (erro) throw toAuthError({ message: erro });
  const session = parseSession(data);
  writeToken(session.token);
  return session;
}

/** Retoma a sessão salva neste aparelho, se ainda for válida. */
export async function restoreAthleteSession(): Promise<AthleteSession | null> {
  const token = readToken();
  if (!token || !supabase) return null;

  const { data, error } = await supabase.rpc('athlete_get_session', { p_token: token });
  if (error) throw toAuthError(error);
  if (!data) {
    writeToken(null);
    return null;
  }
  return parseSession(data);
}

export async function setAthletePassword(token: string, newPassword: string): Promise<AthleteSession> {
  const { data, error } = await client().rpc('athlete_set_password', {
    p_token: token,
    p_new_password: newPassword,
  });
  if (error || !data) throw toAuthError(error);
  return parseSession(data);
}

export async function logoutAthlete(token: string): Promise<void> {
  writeToken(null);
  if (supabase) await supabase.rpc('athlete_logout', { p_token: token });
}

/**
 * Foto do próprio atleta. O atleta não usa o Supabase Auth, então a foto passa pela
 * Edge Function "foto-atleta": ela confere a sessão (token) no banco e grava na pasta
 * dele. Devolve o endereço público da foto nova.
 */
export async function sendAthletePhoto(token: string, photo: Blob): Promise<string> {
  const { data, error } = await client().functions.invoke('foto-atleta', {
    body: photo,
    headers: { 'x-athlete-token': token },
  });
  if (error) {
    // A função responde { erro }; 404 = função ainda não publicada no Supabase
    const res = (error as { context?: unknown }).context;
    let code = '';
    if (res instanceof Response) {
      code = await res.json().then(
        (j: { erro?: string }) => j?.erro ?? '',
        () => ''
      );
      if (!code && res.status === 404) code = 'foto_sem_servidor';
    }
    throw toAuthError({ message: code || error.message });
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw toAuthError({ message: 'falha_servidor' });
  return url;
}

type NewRecord<T> = Omit<T, 'id' | 'created_at' | 'athlete_id'>;

// O banco descobre o atleta pelo token; athlete_id nunca vem do navegador.
export async function submitPse(token: string, r: NewRecord<PseRecord>): Promise<void> {
  const { error } = await client().rpc('athlete_submit_pse', {
    p_token: token,
    p_date: r.date,
    p_training_type: r.training_type ?? null,
    p_rpe_score: r.rpe_score,
    p_did_not_train: r.did_not_train,
    p_observations: r.observations ?? null,
    p_duration_minutes: r.did_not_train ? null : r.duration_minutes ?? null,
  });
  if (error) throw toAuthError(error);
}

export async function submitPsr(token: string, r: NewRecord<PsrRecord>): Promise<void> {
  const { error } = await client().rpc('athlete_submit_psr', {
    p_token: token,
    p_date: r.date,
    p_psr_score: r.psr_score,
    p_fatigue_score: r.fatigue_score,
    p_sleep_score: r.sleep_score,
    p_muscle_soreness_score: r.muscle_soreness_score,
    p_stress_score: r.stress_score,
    p_mood_score: r.mood_score,
  });
  if (error) throw toAuthError(error);
}

export async function submitWeight(token: string, r: NewRecord<WeightRecord>): Promise<void> {
  const { error } = await client().rpc('athlete_submit_weight', {
    p_token: token,
    p_date: r.date,
    p_weight: r.weight,
  });
  if (error) throw toAuthError(error);
}

/** Cronograma da semana (somente leitura para o atleta). */
export async function getAthleteSchedule(token: string, from: string, to: string): Promise<TrainingSession[]> {
  const { data, error } = await client().rpc('athlete_get_schedule', { p_token: token, p_from: from, p_to: to });
  if (error) throw toAuthError(error);
  return (data ?? []) as TrainingSession[];
}

/** Treinador logado volta a senha do atleta para a inicial (nome completo). */
export async function resetAthletePassword(athleteId: string): Promise<void> {
  const { error } = await client().rpc('coach_reset_athlete_password', { p_athlete_id: athleteId });
  if (error) {
    if (error.message?.includes('Could not find the function')) throw toAuthError(error);
    throw new AthleteAuthError('erro', `Erro ao redefinir senha: ${error.message}`);
  }
}

/** Termo de uso dos dados (LGPD): versão aceita pelo atleta (null = pendente). */
export async function getTermsStatus(token: string): Promise<{ accepted_at: string | null; version: string | null }> {
  const { data, error } = await client().rpc('athlete_terms_status', { p_token: token });
  if (error) throw toAuthError(error);
  return data as { accepted_at: string | null; version: string | null };
}

export async function acceptTerms(token: string, version: string): Promise<void> {
  const { error } = await client().rpc('athlete_accept_terms', { p_token: token, p_version: version });
  if (error) throw toAuthError(error);
}

export interface AthleteHistory {
  pse: PseRecord[];
  psr: PsrRecord[];
  weight: WeightRecord[];
}

/** Respostas do próprio atleta no período (máximo 180 dias). */
export async function getAthleteHistory(token: string, from: string, to: string): Promise<AthleteHistory> {
  const { data, error } = await client().rpc('athlete_get_history', { p_token: token, p_from: from, p_to: to });
  if (error) throw toAuthError(error);
  const h = (data ?? {}) as Partial<AthleteHistory>;
  return { pse: h.pse ?? [], psr: h.psr ?? [], weight: (h.weight ?? []).map((w) => ({ ...w, weight: Number(w.weight) })) };
}

/** Apaga uma resposta enviada hoje (para corrigir e enviar de novo). */
export async function deleteAthleteRecord(token: string, kind: 'pse' | 'psr' | 'peso', id: string): Promise<void> {
  const { error } = await client().rpc('athlete_delete_record', { p_token: token, p_kind: kind, p_id: id });
  if (error) throw toAuthError(error);
}

// ---------- Adversários (aba do atleta) ----------
export interface AthleteAdversaries<A, O> {
  me: string;
  adversarios: A[];
  observacoes: O[];
}

/** Fichas da comissão técnica e as do próprio atleta, com as observações que ele pode ver. */
export async function listAthleteAdversaries<A, O>(token: string): Promise<AthleteAdversaries<A, O>> {
  const { data, error } = await client().rpc('athlete_list_adversarios', { p_token: token });
  if (error) throw toAuthError(error);
  const d = (data ?? {}) as Partial<AthleteAdversaries<A, O>>;
  return { me: d.me ?? '', adversarios: d.adversarios ?? [], observacoes: d.observacoes ?? [] };
}

export interface AdversaryInput {
  id?: string;
  nome: string;
  sexo: string;
  categoria_peso: string;
  classe_idade: string;
  tipo_origem: string;
  origem_valor: string;
}

/** Cadastra (sem id) ou edita uma ficha do próprio atleta. */
export async function saveAthleteAdversary(token: string, a: AdversaryInput): Promise<void> {
  const { error } = await client().rpc('athlete_save_adversario', {
    p_token: token,
    p_id: a.id ?? null,
    p_nome: a.nome,
    p_sexo: a.sexo,
    p_categoria_peso: a.categoria_peso,
    p_classe_idade: a.classe_idade,
    p_tipo_origem: a.tipo_origem,
    p_origem_valor: a.origem_valor,
  });
  if (error?.message?.includes('duplicate key')) {
    throw new AthleteAuthError('adversario_repetido', 'Já existe um adversário cadastrado com este nome.');
  }
  if (error) throw toAuthError(error);
}

export async function deleteAthleteAdversary(token: string, id: string): Promise<void> {
  const { error } = await client().rpc('athlete_delete_adversario', { p_token: token, p_id: id });
  if (error) throw toAuthError(error);
}

export async function addAthleteObservation(token: string, adversarioId: string, texto: string): Promise<void> {
  const { error } = await client().rpc('athlete_add_observacao', { p_token: token, p_adversario: adversarioId, p_texto: texto });
  if (error) throw toAuthError(error);
}

export async function deleteAthleteObservation(token: string, id: string): Promise<void> {
  const { error } = await client().rpc('athlete_delete_observacao', { p_token: token, p_id: id });
  if (error) throw toAuthError(error);
}

/** "Apagar para mim": tira a ficha só da lista deste atleta (oculto = false mostra de novo). */
export async function setAthleteAdversaryHidden(token: string, id: string, oculto: boolean): Promise<void> {
  const { error } = await client().rpc('athlete_set_adversario_oculto', { p_token: token, p_id: id, p_oculto: oculto });
  if (error) throw toAuthError(error);
}

// ---------- Preparação física (PRs e treinos físicos) ----------
export interface CatalogExercise {
  id: string;
  nome: string;
}

export interface AthletePr {
  id: string;
  exercicio: string;
  peso_pr: number;
  updated_at?: string;
}

/** Exercícios do catálogo do clube que pedem PR e os PRs do atleta logado. */
export async function listAthletePrs(token: string): Promise<{ catalog: CatalogExercise[]; prs: AthletePr[] }> {
  const { data, error } = await client().rpc('athlete_list_prs', { p_token: token });
  if (error) throw toAuthError(error);
  const d = (data ?? {}) as { catalog?: CatalogExercise[]; prs?: AthletePr[] };
  return { catalog: d.catalog ?? [], prs: (d.prs ?? []).map((p) => ({ ...p, peso_pr: Number(p.peso_pr) })) };
}

/** Grava ou atualiza o PR (carga de 1 repetição, em kg) num exercício do catálogo. */
export async function saveAthletePr(token: string, exercicio: string, peso: number): Promise<void> {
  const { error } = await client().rpc('athlete_save_pr', { p_token: token, p_exercicio: exercicio, p_peso: peso });
  if (error) throw toAuthError(error);
}

export async function deleteAthletePr(token: string, id: string): Promise<void> {
  const { error } = await client().rpc('athlete_delete_pr', { p_token: token, p_id: id });
  if (error) throw toAuthError(error);
}

export interface WorkoutPrescription {
  id: string;
  bloco: string;
  exercicio: string;
  series: number;
  repeticoes: string;
  usa_pr: boolean;
  porcentagem_pr?: number | null;
  observacoes_tecnico?: string | null;
  /** Exercício com barra de 20 kg (mostra as anilhas). Padrão: sim. */
  usa_barra?: boolean;
}

export interface AthleteWorkout {
  prescriptions: WorkoutPrescription[];
  /** PR por exercício (nome em minúsculas, sem espaços nas pontas) */
  prs: Record<string, number>;
  /** Preenchido quando o atleta já concluiu este treino (em qualquer aparelho) */
  completion: { duration_minutes: number; completed_at: string } | null;
}

/** Ficha do treino físico: exercícios, PRs do atleta e se ele já concluiu. */
export async function getAthleteWorkout(token: string, sessionId: string): Promise<AthleteWorkout> {
  const { data, error } = await client().rpc('athlete_get_workout', { p_token: token, p_session: sessionId });
  if (error) throw toAuthError(error);
  const d = (data ?? {}) as {
    prescriptions?: WorkoutPrescription[];
    prs?: { exercicio: string; peso_pr: number }[];
    completion?: AthleteWorkout['completion'];
  };
  const prs: Record<string, number> = {};
  for (const p of d.prs ?? []) prs[p.exercicio.toLowerCase().trim()] = Number(p.peso_pr);
  return {
    prescriptions: (d.prescriptions ?? []).map((p) => ({
      ...p,
      series: Number(p.series),
      porcentagem_pr: p.porcentagem_pr === null || p.porcentagem_pr === undefined ? null : Number(p.porcentagem_pr),
    })),
    prs,
    completion: d.completion ?? null,
  };
}

/** Marca o treino físico como concluído (a duração vai junto para a PSE). */
export async function completeAthleteWorkout(token: string, sessionId: string, durationMinutes: number): Promise<void> {
  const { error } = await client().rpc('athlete_complete_workout', {
    p_token: token,
    p_session: sessionId,
    p_duration_minutes: durationMinutes,
  });
  if (error) throw toAuthError(error);
}

// ---------- Conquistas e cartões para compartilhar ----------
export interface AthleteAchievementsData {
  today: string;
  categoria: string | null;
  /** Dias com alguma resposta (PSR ou PSE), do mais novo para o mais antigo (último ano) */
  dias_respondidos: string[];
  /** Dias com treino programado para o atleta (último ano) */
  dias_treino: string[];
  /** Treinos registrados (PSE sem "não treinei"), desde o começo */
  treinos: number;
  /** Data em que chegou a 10, 50, 100, 250 e 500 treinos */
  marcos_treinos: Record<string, string>;
  /** PSE do começo do mês anterior até hoje (para os resumos) */
  pse: { date: string; training_type: string | null; rpe_score: number | null; duration_minutes: number | null; did_not_train: boolean }[];
  pesos: { date: string; weight: number }[];
  /** Datas de pesagem oficial das competições do atleta */
  pesagens: string[];
  prs: { exercicio: string; peso_pr: number; updated_at: string }[];
}

/** Sequência de dias, selos e resumos: tudo do próprio atleta, numa consulta só (só leitura). */
export async function getAthleteAchievements(token: string): Promise<AthleteAchievementsData> {
  const { data, error } = await client().rpc('athlete_achievements', { p_token: token });
  if (error) throw toAuthError(error);
  const d = (data ?? {}) as Partial<AthleteAchievementsData>;
  return {
    today: d.today ?? '',
    categoria: d.categoria ?? null,
    dias_respondidos: d.dias_respondidos ?? [],
    dias_treino: d.dias_treino ?? [],
    treinos: Number(d.treinos ?? 0),
    marcos_treinos: d.marcos_treinos ?? {},
    pse: d.pse ?? [],
    pesos: (d.pesos ?? []).map((w) => ({ date: w.date, weight: Number(w.weight) })),
    pesagens: d.pesagens ?? [],
    prs: (d.prs ?? []).map((p) => ({ ...p, peso_pr: Number(p.peso_pr) })),
  };
}

// ---------- Tela "Hoje" ----------
export interface HomeSession extends TrainingSession {
  /** Ficha do treino físico já concluída */
  completed?: boolean;
}

export interface AthleteHome {
  today: string;
  psr: { id: string; created_at: string } | null;
  weight: { id: string; weight: number; created_at: string } | null;
  lastWeight: { weight: number; date: string } | null;
  pse: { id: string; training_type: string | null; rpe_score: number | null; did_not_train: boolean; duration_minutes: number | null; created_at: string }[];
  /** Hoje é dia de pesagem do clube */
  weighDay: boolean;
  /** O clube tem exercícios com PR (mostra a aba de PRs) */
  prCatalog: boolean;
  sessions: HomeSession[];
}

/** Tudo o que a tela "Hoje" precisa numa consulta só (respostas de hoje, treinos do dia, último peso). */
export async function getAthleteHome(token: string): Promise<AthleteHome> {
  const { data, error } = await client().rpc('athlete_home', { p_token: token });
  if (error) throw toAuthError(error);
  const d = (data ?? {}) as any;
  return {
    today: d.today,
    psr: d.psr ?? null,
    weight: d.weight ? { ...d.weight, weight: Number(d.weight.weight) } : null,
    lastWeight: d.last_weight ? { weight: Number(d.last_weight.weight), date: d.last_weight.date } : null,
    pse: d.pse ?? [],
    weighDay: Boolean(d.weigh_day),
    prCatalog: Boolean(d.pr_catalog),
    sessions: (d.sessions ?? []) as HomeSession[],
  };
}
