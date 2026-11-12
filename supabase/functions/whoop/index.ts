// Supabase Edge Function: WHOOP (conexão do atleta e leitura dos dados).
//
// O que faz:
//  * "start"      -> devolve o endereço de autorização da WHOOP (OAuth 2.0). O atleta
//                    abre, entra na conta WHOOP dele e autoriza.
//  * volta do OAuth (GET com ?code) -> troca o código por tokens, guarda em
//                    public.whoop_connections (ninguém além do servidor lê os tokens)
//                    e já sincroniza os últimos 30 dias.
//  * "sync"       -> relê recuperação, sono e ciclos (strain) e grava o resumo diário
//                    em public.whoop_metrics. Pode ser chamado pelo atleta (token do
//                    app) ou pela comissão técnica (login do Supabase), sempre para
//                    um atleta do mesmo clube.
//  * "disconnect" -> revoga o acesso na WHOOP e apaga a conexão e os dados do atleta.
//
// Segredos (nunca no navegador):
//   npx supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... APP_PUBLIC_URL=https://...
//   WHOOP_REDIRECT_URL é opcional; o padrão é <SUPABASE_URL>/functions/v1/whoop
//
// Publicar: npx supabase functions deploy whoop --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const API = 'https://api.prod.whoop.com/developer/v2';
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
/** `offline` é obrigatório para receber o refresh token */
const SCOPE = 'offline read:recovery read:cycles read:sleep read:profile';
const DAYS = 30;
const ZONE = 'America/Sao_Paulo';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-athlete-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (erro: string, status = 400, detalhe?: string) =>
  json(detalhe ? { erro, detalhe } : { erro }, status);

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

function functionUrl(): string {
  const fixed = env('WHOOP_REDIRECT_URL');
  if (fixed) return fixed;
  return `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/whoop`;
}

/** Só volta para endereços http(s) (http apenas em localhost), evitando redirecionamento aberto. */
function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:') return u.origin;
    if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return u.origin;
    return null;
  } catch {
    return null;
  }
}

/** A WHOOP exige um `state` de 8 caracteres; ele só identifica o pedido guardado no banco. */
function newState(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const brDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE });

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function exchangeCode(code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env('WHOOP_CLIENT_ID'),
    client_secret: env('WHOOP_CLIENT_SECRET'),
    redirect_uri: functionUrl(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token_${res.status}`);
  return (await res.json()) as TokenSet;
}

interface Connection {
  athlete_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Renova o token e grava no banco. A WHOOP invalida o refresh token antigo a cada
 * renovação, então a gravação só vale se ninguém tiver renovado antes (comparação
 * pelo refresh_token lido). Se outro pedido venceu a corrida, usa o token do banco.
 */
async function refreshAccessToken(conn: Connection): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
    client_id: env('WHOOP_CLIENT_ID'),
    client_secret: env('WHOOP_CLIENT_SECRET'),
    scope: 'offline',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`refresh_${res.status}`);
  const tokens = (await res.json()) as TokenSet;

  const { data: saved } = await supabase
    .from('whoop_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? conn.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    })
    .eq('athlete_id', conn.athlete_id)
    .eq('refresh_token', conn.refresh_token)
    .select('access_token')
    .maybeSingle();

  if (saved?.access_token) return saved.access_token as string;

  const { data: fresh } = await supabase
    .from('whoop_connections')
    .select('access_token')
    .eq('athlete_id', conn.athlete_id)
    .maybeSingle();
  return (fresh?.access_token as string | undefined) ?? tokens.access_token;
}

/**
 * Um refresh por atleta ao mesmo tempo neste processo (evita disputa de token).
 * Entre instâncias da função a corrida é resolvida no banco (gravação condicional);
 * se o outro lado já renovou, aproveitamos o token novo em vez de falhar.
 */
const refreshing = new Map<string, Promise<string>>();

/** Usa o token guardado; renova quando faltam menos de 2 minutos. */
async function accessToken(conn: Connection): Promise<string> {
  if (new Date(conn.expires_at).getTime() > Date.now() + 120_000) return conn.access_token;

  const running = refreshing.get(conn.athlete_id);
  if (running) return running;

  const task = refreshAccessToken(conn)
    .catch(async (err) => {
      const { data: fresh } = await supabase
        .from('whoop_connections')
        .select('access_token, expires_at')
        .eq('athlete_id', conn.athlete_id)
        .maybeSingle();
      if (fresh?.access_token && new Date(fresh.expires_at).getTime() > Date.now() + 120_000) {
        return fresh.access_token as string;
      }
      throw err;
    })
    .finally(() => refreshing.delete(conn.athlete_id));
  refreshing.set(conn.athlete_id, task);
  return task;
}

// deno-lint-ignore no-explicit-any
async function collect(path: string, token: string, start: string): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  let next: string | null = null;
  for (let page = 0; page < 4; page += 1) {
    const qs = new URLSearchParams({ limit: '25', start });
    if (next) qs.set('nextToken', next);
    const res = await fetch(`${API}/${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error('whoop_nao_autorizado');
    if (res.status === 429) throw new Error('whoop_limite');
    if (!res.ok) throw new Error(`whoop_http_${res.status}`);
    const body = await res.json();
    out.push(...(body.records ?? []));
    next = body.next_token ?? null;
    if (!next) break;
  }
  return out;
}

type DayRow = {
  club_id: string;
  athlete_id: string;
  date: string;
  recovery_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  spo2?: number | null;
  skin_temp?: number | null;
  sleep_hours?: number | null;
  sleep_performance?: number | null;
  sleep_efficiency?: number | null;
  strain?: number | null;
  day_kj?: number | null;
  steps?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  updated_at: string;
};

/** Lê a WHOOP e grava um resumo por dia (fuso de Brasília). */
async function syncAthlete(athleteId: string): Promise<{ days: number; metrics: number }> {
  const { data: connData, error: connError } = await supabase
    .from('whoop_connections')
    .select('athlete_id, access_token, refresh_token, expires_at')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (connError) throw new Error('falha_servidor');
  if (!connData) throw new Error('sem_conexao');

  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select('id, club_id')
    .eq('id', athleteId)
    .maybeSingle();
  if (athleteError || !athlete?.club_id) throw new Error('falha_servidor');

  const token = await accessToken(connData as Connection);
  const start = new Date(Date.now() - (DAYS + 1) * 86_400_000).toISOString();

  const [recoveries, sleeps, cycles] = await Promise.all([
    collect('recovery', token, start),
    collect('activity/sleep', token, start),
    collect('cycle', token, start),
  ]);

  const rows = new Map<string, DayRow>();
  const sleepDay = new Map<string, string>();
  // O ciclo da WHOOP começa quando o atleta dorme e termina quando ele dorme de novo.
  // Por isso o dia do ciclo é o dia em que o sono daquele ciclo terminou (o dia em
  // que o atleta acordou), e não o dia do `start` (a noite anterior).
  const cycleDay = new Map<string, string>();
  const row = (date: string): DayRow => {
    const found = rows.get(date);
    if (found) return found;
    const created: DayRow = { club_id: athlete.club_id, athlete_id: athleteId, date, updated_at: new Date().toISOString() };
    rows.set(date, created);
    return created;
  };

  // Sono (as sonecas ficam de fora: o dia vale pelo sono principal)
  for (const s of sleeps) {
    if (s.nap || !s.end) continue;
    const date = brDate(s.end);
    sleepDay.set(String(s.id), date);
    if (s.cycle_id != null) cycleDay.set(String(s.cycle_id), date);
    const stages = s.score?.stage_summary;
    if (!stages) continue;
    const asleep =
      (stages.total_light_sleep_time_milli ?? 0) +
      (stages.total_slow_wave_sleep_time_milli ?? 0) +
      (stages.total_rem_sleep_time_milli ?? 0);
    Object.assign(row(date), {
      sleep_hours: asleep > 0 ? round(asleep / 3_600_000, 2) : null,
      sleep_performance: s.score?.sleep_performance_percentage ?? null,
      sleep_efficiency: s.score?.sleep_efficiency_percentage ?? null,
    });
  }

  // Recuperação (ligada ao sono: o dia da recuperação é o dia em que o sono terminou)
  for (const r of recoveries) {
    const date = sleepDay.get(String(r.sleep_id));
    const score = r.score;
    if (!date || !score) continue;
    Object.assign(row(date), {
      recovery_score: score.recovery_score ?? null,
      hrv_ms: score.hrv_rmssd_milli != null ? round(score.hrv_rmssd_milli) : null,
      resting_hr: score.resting_heart_rate ?? null,
      spo2: score.spo2_percentage != null ? round(score.spo2_percentage) : null,
      skin_temp: score.skin_temp_celsius != null ? round(score.skin_temp_celsius) : null,
    });
  }

  // Ciclo do dia: strain, gasto e passos. O ciclo é fisiológico (começa no sono),
  // então usamos o dia do sono daquele ciclo; só se não houver sono usamos o fim
  // do ciclo (e, por último, o início).
  for (const c of cycles) {
    if (!c.start) continue;
    const score = c.score;
    const date = cycleDay.get(String(c.id)) ?? brDate(c.end ?? c.start);
    Object.assign(row(date), {
      strain: score?.strain != null ? round(score.strain) : null,
      day_kj: score?.kilojoule != null ? round(score.kilojoule, 1) : null,
      steps: c.step_count ?? null,
      avg_hr: score?.average_heart_rate ?? null,
      max_hr: score?.max_heart_rate ?? null,
    });
  }

  const list = [...rows.values()].filter((r) => Object.keys(r).length > 4);
  if (list.length) {
    const { error } = await supabase.from('whoop_metrics').upsert(list, { onConflict: 'athlete_id,date' });
    if (error) throw new Error('falha_servidor');
  }

  await supabase
    .from('whoop_connections')
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq('athlete_id', athleteId);

  return { days: list.length, metrics: list.length };
}

async function athleteFromToken(token: string): Promise<{ id: string } | null> {
  const { data } = await supabase.rpc('athlete_get_session', { p_token: token });
  const id = (data as { athlete?: { id?: string } } | null)?.athlete?.id;
  return id ? { id } : null;
}

async function athleteForCoach(jwt: string, athleteId: string): Promise<{ id: string } | null> {
  const { data: auth } = await supabase.auth.getUser(jwt);
  const userId = auth?.user?.id;
  if (!userId) return null;

  const { data: coach } = await supabase
    .from('coaches')
    .select('club_id, active')
    .eq('user_id', userId)
    .maybeSingle();
  if (!coach?.active || !coach.club_id) return null;

  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, club_id')
    .eq('id', athleteId)
    .maybeSingle();
  if (!athlete || athlete.club_id !== coach.club_id) return null;

  return { id: athlete.id };
}

async function start(req: Request): Promise<Response> {
  if (!env('WHOOP_CLIENT_ID') || !env('WHOOP_CLIENT_SECRET')) return fail('whoop_sem_configuracao', 503);

  const token = (req.headers.get('x-athlete-token') ?? '').trim();
  const athlete = token ? await athleteFromToken(token) : null;
  if (!athlete) return fail('sessao_invalida', 401);

  const origin = safeOrigin(req.headers.get('origin')) ?? safeOrigin(env('APP_PUBLIC_URL'));
  const state = newState();

  // Limpa pedidos antigos e guarda este (uso único, 15 minutos)
  await supabase
    .from('whoop_pending_states')
    .delete()
    .lt('created_at', new Date(Date.now() - 3_600_000).toISOString());
  const { error: stateError } = await supabase
    .from('whoop_pending_states')
    .insert({ state, athlete_id: athlete.id, origin });
  if (stateError) return fail('falha_servidor', 500);

  const qs = new URLSearchParams({
    client_id: env('WHOOP_CLIENT_ID'),
    redirect_uri: functionUrl(),
    response_type: 'code',
    scope: SCOPE,
    state,
  });
  return json({ url: `${AUTH_URL}?${qs}` });
}

async function callback(url: URL): Promise<Response> {
  const stateValue = (url.searchParams.get('state') ?? '').trim();
  const { data: pending } = await supabase
    .from('whoop_pending_states')
    .select('athlete_id, origin, created_at')
    .eq('state', stateValue)
    .maybeSingle();

  const back = safeOrigin(pending?.origin) ?? safeOrigin(env('APP_PUBLIC_URL'));
  const redirect = (params: string) => {
    if (!back) return json({ erro: 'origem_invalida' }, 400);
    return Response.redirect(`${back}/?${params}`, 302);
  };

  if (!pending) return redirect('whoop=erro&motivo=estado_invalido');
  // Uso único: o mesmo state não serve para uma segunda volta
  await supabase.from('whoop_pending_states').delete().eq('state', stateValue);
  if (Date.now() - new Date(pending.created_at).getTime() > 15 * 60 * 1000) {
    return redirect('whoop=erro&motivo=estado_invalido');
  }
  if (url.searchParams.get('error')) return redirect('whoop=erro&motivo=acesso_negado');

  const code = url.searchParams.get('code');
  if (!code) return redirect('whoop=erro&motivo=codigo_ausente');

  try {
    const tokens = await exchangeCode(code);
    // O refresh_token é o que garante acesso contínuo (scope `offline`). Se ele veio,
    // não dependemos de a WHOOP repetir o `scope` na resposta.
    if (!tokens.refresh_token) return redirect('whoop=erro&motivo=sem_refresh');

    let name: string | null = null;
    let whoopId: string | null = null;
    const profile = await fetch(`${API}/user/profile/basic`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profile.ok) {
      const p = (await profile.json()) as { user_id?: number; first_name?: string; last_name?: string };
      whoopId = p.user_id != null ? String(p.user_id) : null;
      name = [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
    }

    const { data: previous } = await supabase
      .from('whoop_connections')
      .select('whoop_user_id')
      .eq('athlete_id', pending.athlete_id)
      .maybeSingle();

    const { error } = await supabase.from('whoop_connections').upsert(
      {
        athlete_id: pending.athlete_id,
        whoop_user_id: whoopId,
        whoop_name: name,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scope: tokens.scope,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'athlete_id' }
    );
    if (error) return redirect('whoop=erro&motivo=banco');

    // Trocou de conta WHOOP sem desconectar: os dias da conta antiga não valem mais.
    if (previous?.whoop_user_id && whoopId && previous.whoop_user_id !== whoopId) {
      await supabase.from('whoop_metrics').delete().eq('athlete_id', pending.athlete_id);
    }

    // Sincroniza já na conexão (se falhar, a conexão continua valendo)
    try {
      await syncAthlete(pending.athlete_id);
    } catch (err) {
      await supabase
        .from('whoop_connections')
        .update({ last_error: String((err as Error).message).slice(0, 200) })
        .eq('athlete_id', pending.athlete_id);
    }

    return redirect('whoop=conectado');
  } catch (err) {
    await supabase
      .from('whoop_connections')
      .update({ last_error: String((err as Error).message).slice(0, 200) })
      .eq('athlete_id', pending.athlete_id);
    return redirect('whoop=erro&motivo=falha');
  }
}

/** Chamado pelo agendamento do banco (cabeçalho x-cron-secret): sincroniza todos. */
async function syncAll(): Promise<Response> {
  const { data: connections, error } = await supabase.from('whoop_connections').select('athlete_id');
  if (error) return fail('falha_servidor', 500);

  let synced = 0;
  const failures: string[] = [];
  for (const conn of connections ?? []) {
    const id = conn.athlete_id as string;
    try {
      await syncAthlete(id);
      synced += 1;
    } catch (err) {
      const code = String((err as Error).message);
      failures.push(`${id}:${code}`);
      await supabase.from('whoop_connections').update({ last_error: code.slice(0, 200) }).eq('athlete_id', id);
    }
  }
  return json({ ok: true, synced, failed: failures.length, failures });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  // A volta do OAuth pode trazer `code` (autorizou) ou só `error` (negou). Nos dois
  // casos precisamos redirecionar o navegador de volta para o app.
  if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('state'))) {
    return callback(url);
  }

  if (req.method !== 'POST') return fail('metodo_invalido', 405);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const athleteToken = (req.headers.get('x-athlete-token') ?? '').trim();

  if (action === 'start') return start(req);

  // Agendamento do banco: sincroniza todos os atletas conectados. Sem CRON_SECRET
  // configurado a ação fica fechada (ninguém sincroniza a base inteira sem segredo).
  if (action === 'sync_all') {
    const secret = env('CRON_SECRET');
    if (!secret || (req.headers.get('x-cron-secret') ?? '').trim() !== secret) return fail('nao_autorizado', 401);
    return syncAll();
  }

  // Quem está pedindo: o próprio atleta (token do app) ou um treinador (login Supabase)
  let athleteId: string | null = null;
  if (athleteToken) {
    const athlete = await athleteFromToken(athleteToken);
    if (athlete) athleteId = athlete.id;
    else return fail('sessao_invalida', 401);
  } else {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const target = typeof body.athlete_id === 'string' ? body.athlete_id : '';
    if (!jwt || !target) return fail('nao_autorizado', 401);
    const athlete = await athleteForCoach(jwt, target);
    if (!athlete) return fail('nao_autorizado', 403);
    athleteId = athlete.id;
  }

  if (action === 'disconnect') {
    const { data: conn } = await supabase
      .from('whoop_connections')
      .select('access_token, expires_at, refresh_token, athlete_id')
      .eq('athlete_id', athleteId)
      .maybeSingle();
    if (!conn) return json({ ok: true });

    try {
      const token = await accessToken(conn as Connection);
      await fetch(`${API}/user/access`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Mesmo sem revogar na WHOOP, os dados saem do app
    }

    await supabase.from('whoop_metrics').delete().eq('athlete_id', athleteId);
    await supabase.from('whoop_connections').delete().eq('athlete_id', athleteId);
    return json({ ok: true });
  }

  if (!action || action === 'sync') {
    try {
      const result = await syncAthlete(athleteId);
      return json({ ok: true, ...result });
    } catch (err) {
      const code = String((err as Error).message);
      // Refresh recusado = o atleta precisa reconectar (a WHOOP invalidou o acesso).
      if (/^refresh_(400|401|403)$/.test(code)) {
        await supabase
          .from('whoop_connections')
          .update({ last_error: 'whoop_nao_autorizado' })
          .eq('athlete_id', athleteId);
        return fail('whoop_nao_autorizado', 502);
      }
      const known = ['sem_conexao', 'whoop_nao_autorizado', 'whoop_limite'];
      if (known.includes(code)) {
        await supabase
          .from('whoop_connections')
          .update({ last_error: code })
          .eq('athlete_id', athleteId);
        return fail(code, code === 'sem_conexao' ? 404 : 502);
      }
      return fail('falha_servidor', 500, code.slice(0, 200));
    }
  }

  return fail('acao_invalida', 400);
});
