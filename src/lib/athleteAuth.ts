import { supabase } from './supabase';
import { onlyCpfDigits } from './cpf';
import type { ClubInfo } from './club';
import { PseRecord, PsrRecord, TrainingSession, WeightRecord } from '../types';

// Login do atleta: CPF + senha, validados por funções no banco
// (ver supabase_login_atleta.sql). Atletas não usam o Supabase Auth,
// que fica reservado à comissão técnica.

export interface AthleteSession {
  token: string;
  mustChangePassword: boolean;
  athlete: {
    id: string;
    nome: string;
    classe?: string | null;
    categoria?: string | null;
  };
  club: ClubInfo | null;
}

const TOKEN_KEY = 'athlete_session_token';

const ERROR_MESSAGES: Record<string, string> = {
  credenciais_invalidas: 'CPF ou senha incorretos. Confira os dados ou fale com seu treinador.',
  sessao_invalida: 'Sua sessão expirou. Entre novamente.',
  troca_de_senha_pendente: 'Você precisa criar sua nova senha antes de enviar respostas.',
  senha_curta: 'A nova senha precisa ter pelo menos 6 caracteres.',
  senha_igual_inicial: 'A nova senha não pode ser igual à senha inicial (seu nome completo).',
  senha_ja_definida: 'Sua senha já foi definida. Entre novamente com ela.',
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
