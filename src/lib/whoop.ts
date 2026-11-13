import { supabase } from './supabase';

// WHOOP: o atleta conecta a própria conta pelo perfil e a comissão técnica
// acompanha recuperação, sono e strain. Os tokens ficam no servidor
// (Edge Function "whoop") — nada de token no navegador.

export interface WhoopDay {
  date: string;
  recovery_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  spo2?: number | null;
  sleep_hours: number | null;
  sleep_performance: number | null;
  sleep_efficiency?: number | null;
  strain: number | null;
  day_kj: number | null;
  steps: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
}

export interface WhoopStatus {
  connected: boolean;
  whoop_name?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  days: WhoopDay[];
}

const MESSAGES: Record<string, string> = {
  whoop_sem_configuracao:
    'A conexão com a WHOOP ainda não foi ativada no servidor (faltam as chaves da WHOOP). Avise a comissão técnica.',
  whoop_sem_servidor: 'A conexão com a WHOOP ainda não foi publicada no servidor. Avise a comissão técnica.',
  sessao_invalida: 'Sua sessão expirou. Entre novamente.',
  nao_autorizado: 'Você não tem acesso a este atleta.',
  sem_conexao: 'Este atleta ainda não conectou o WHOOP.',
  whoop_nao_autorizado: 'A WHOOP não autoriza mais este acesso. Conecte o WHOOP de novo.',
  whoop_limite: 'A WHOOP limitou as consultas agora. Espere alguns minutos e tente de novo.',
  acesso_negado: 'Você não autorizou o acesso na WHOOP.',
  falha_servidor: 'Não foi possível falar com o servidor agora. Tente de novo em instantes.',
  metodo_invalido: 'O pedido não foi aceito pelo servidor. Atualize o app e tente de novo.',
  acao_invalida: 'O pedido não foi aceito pelo servidor. Atualize o app e tente de novo.',
  estado_invalido: 'A conexão expirou antes de terminar. Tente conectar de novo.',
  sem_refresh: 'A WHOOP não liberou o acesso contínuo. Tente conectar de novo.',
};

function client() {
  if (!supabase) throw new Error('Supabase não configurado. Verifique o arquivo .env.');
  return supabase;
}

/** Texto amigável do código de erro; `null` quando não é um código conhecido. */
function messageFor(text: string | undefined): string | null {
  const raw = text ?? '';
  const code = Object.keys(MESSAGES).find((c) => raw.includes(c));
  if (code) return MESSAGES[code];
  // SQL da parte 19 ainda não aplicado no banco: o PostgREST não acha a função/tabela.
  if (/could not find the (function|table)|does not exist/i.test(raw)) return MESSAGES.whoop_sem_servidor;
  return null;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<WhoopStatus> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(messageFor(error.message) ?? 'Não foi possível carregar os dados da WHOOP agora.');
  const d = (data ?? {}) as Partial<WhoopStatus>;
  return { ...d, connected: Boolean(d.connected), days: d.days ?? [] };
}

async function call(body: Record<string, unknown>, athleteToken?: string) {
  const headers: Record<string, string> = {};
  if (athleteToken) headers['x-athlete-token'] = athleteToken;
  const { data, error } = await client().functions.invoke('whoop', { body, headers });
  if (error) {
    const res = (error as { context?: unknown }).context;
    let code = '';
    if (res instanceof Response) {
      code = await res.json().then(
        (j: { erro?: string }) => j?.erro ?? '',
        () => ''
      );
      if (!code && res.status === 404) code = 'whoop_sem_servidor';
    }
    throw new Error(messageFor(code) ?? 'Não foi possível falar com a WHOOP agora. Tente de novo.');
  }
  return (data ?? {}) as { url?: string; ok?: boolean; days?: number };
}

/** Situação do atleta logado (o banco descobre quem é pelo token). */
export const athleteWhoop = (token: string) => rpc('athlete_whoop', { p_token: token });

/** Situação de um atleta para a comissão técnica (mesmo clube). */
export const coachWhoop = (athleteId: string) => rpc('club_whoop_status', { p_athlete_id: athleteId });

/** Endereço de autorização da WHOOP (o atleta abre e autoriza a conta dele). */
export async function startWhoopConnection(token: string): Promise<string> {
  const { url } = await call({ action: 'start' }, token);
  if (!url) throw new Error('A WHOOP não devolveu o endereço de conexão. Tente de novo.');
  return url;
}

/** Relê os dados do atleta logado. */
export const syncMyWhoop = (token: string) => call({ action: 'sync' }, token);

/** Relê os dados de um atleta do clube (comissão técnica). */
export const syncWhoop = (athleteId: string) => call({ action: 'sync', athlete_id: athleteId });

/** Revoga o acesso na WHOOP e apaga a conexão e os dados do atleta. */
export const disconnectWhoop = (token: string) => call({ action: 'disconnect' }, token);

/** Atleta do clube com o WHOOP conectado (lista da comissão e etiqueta "WHOOP"). */
export interface WhoopAthlete {
  athlete_id: string;
  nome: string;
  photo_url?: string | null;
  classe?: string | null;
  categoria?: string | null;
  active?: boolean;
  whoop_name?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  sync_error?: boolean;
  /** Último dia com números (null = nenhum dia importado ainda) */
  last_day: Pick<WhoopDay, 'date' | 'recovery_score' | 'hrv_ms' | 'resting_hr' | 'sleep_hours' | 'sleep_performance' | 'strain'> | null;
  /** Média de recuperação dos últimos 7 dias */
  recovery_7d: number | null;
}

const TTL_MS = 2 * 60 * 1000;
let cache: { at: number; promise: Promise<WhoopAthlete[]> } | null = null;

/**
 * Atletas do clube que conectaram o WHOOP (guardado por 2 minutos).
 * Banco sem a função nova: lista vazia (as telas seguem sem a etiqueta).
 */
export function listWhoopAthletes(force = false): Promise<WhoopAthlete[]> {
  if (!supabase) return Promise.resolve([]);
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = (async () => {
    const { data, error } = await supabase!.rpc('club_whoop_athletes');
    if (error) {
      if (messageFor(error.message) === MESSAGES.whoop_sem_servidor) return [];
      throw new Error(messageFor(error.message) ?? 'Não foi possível carregar os atletas com WHOOP.');
    }
    return ((data ?? []) as WhoopAthlete[]).map((a) => ({ ...a, recovery_7d: whoopNumber(a.recovery_7d) }));
  })();
  cache = { at: Date.now(), promise };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

/** Recuperação da WHOOP: verde (67+), amarela (34–66) ou vermelha (até 33). */
export const recoveryTone = (v: number | null) =>
  v === null ? 'text-slate-500' : v >= 67 ? 'text-emerald-300' : v >= 34 ? 'text-amber-300' : 'text-rose-300';

/** Números vindo do banco podem chegar como texto (numeric). */
export const whoopNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
