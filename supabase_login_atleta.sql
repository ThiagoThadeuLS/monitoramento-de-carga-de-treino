-- ============================================================
-- MIGRAÇÃO: CPF + LOGIN DO ATLETA
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Pode ser executado mais de uma vez e NÃO apaga dados existentes.
-- ⚠️ Depois de rodar este arquivo, rode também supabase_multiclube.sql
--    (ele refaz algumas funções daqui para separar os dados por clube).
--
-- Regras:
--  * Só atletas cadastrados pelo treinador (e ativos) conseguem entrar.
--  * Login = CPF. Senha inicial = nome completo, tudo junto, minúsculo
--    (ex.: "Gabriel Silva" -> "gabrielsilva"; acentos são ignorados).
--  * No primeiro acesso o atleta é obrigado a criar uma senha nova,
--    diferente da inicial.
--  * Atletas não usam o Supabase Auth: o papel "authenticated" continua
--    sendo exclusivo da comissão técnica.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. CPF no cadastro do atleta (somente números, único)
-- ------------------------------------------------------------
alter table public.athletes add column if not exists cpf text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'athletes_cpf_formato') then
    alter table public.athletes
      add constraint athletes_cpf_formato check (cpf ~ '^[0-9]{11}$');
  end if;
end $$;

create unique index if not exists athletes_cpf_unico on public.athletes (cpf);

-- ------------------------------------------------------------
-- 2. Senhas e sessões dos atletas
--    Sem linha em athlete_credentials = atleta ainda está com a senha
--    inicial e precisa redefinir no próximo login.
--    RLS ligado e nenhuma política: só as funções abaixo acessam.
-- ------------------------------------------------------------
create table if not exists public.athlete_credentials (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  password_hash text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.athlete_sessions (
  token uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + interval '30 days') not null
);

create index if not exists athlete_sessions_athlete_idx on public.athlete_sessions (athlete_id);

alter table public.athlete_credentials enable row level security;
alter table public.athlete_sessions enable row level security;
revoke all on public.athlete_credentials from anon, authenticated;
revoke all on public.athlete_sessions from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Fim do acesso anônimo direto às tabelas
--    (atleta agora precisa estar logado; dados pessoais como CPF e
--    celular deixam de ser públicos — LGPD)
-- ------------------------------------------------------------
drop policy if exists "Atletas visíveis para seleção anônima" on public.athletes;
drop policy if exists "Inserção anônima de PSE" on public.pse_records;
drop policy if exists "Inserção anônima de PSR" on public.psr_records;
drop policy if exists "Inserção anônima de Peso" on public.weight_records;

-- ------------------------------------------------------------
-- 4. Funções auxiliares (uso interno)
-- ------------------------------------------------------------

-- Senha inicial a partir do nome: minúsculo, sem espaços e sem acentos.
create or replace function public.athlete_initial_password(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(
      coalesce(p_nome, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )),
    '\s+', '', 'g'
  );
$$;

-- Dados do atleta devolvidos ao app (sem CPF/celular).
create or replace function public._athlete_session_json(p_token uuid, p_athlete public.athletes)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'token', p_token,
    'must_change_password', not exists (
      select 1 from public.athlete_credentials c where c.athlete_id = p_athlete.id
    ),
    'athlete', json_build_object(
      'id', p_athlete.id,
      'nome', p_athlete.nome,
      'classe', p_athlete.classe,
      'categoria', p_athlete.categoria
    )
  );
$$;

-- Atleta ativo dono de uma sessão válida (ou erro).
create or replace function public._athlete_from_token(p_token uuid)
returns public.athletes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes;
begin
  select a.* into v_athlete
  from public.athlete_sessions s
  join public.athletes a on a.id = s.athlete_id
  where s.token = p_token
    and s.expires_at > now()
    and a.active;

  if not found then
    raise exception 'sessao_invalida';
  end if;

  return v_athlete;
end;
$$;

-- Igual à anterior, mas exige que a senha inicial já tenha sido trocada.
create or replace function public._athlete_ready(p_token uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes;
begin
  v_athlete := public._athlete_from_token(p_token);

  if not exists (select 1 from public.athlete_credentials c where c.athlete_id = v_athlete.id) then
    raise exception 'troca_de_senha_pendente';
  end if;

  return v_athlete.id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Funções chamadas pelo app (supabase.rpc)
-- ------------------------------------------------------------

-- Login do atleta com CPF + senha. Devolve um token de sessão.
create or replace function public.athlete_login(p_cpf text, p_password text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes;
  v_hash text;
  v_token uuid;
begin
  select * into v_athlete
  from public.athletes
  where cpf = regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g')
    and active;

  if not found then
    raise exception 'credenciais_invalidas';
  end if;

  select password_hash into v_hash
  from public.athlete_credentials
  where athlete_id = v_athlete.id;

  if v_hash is null then
    -- Primeiro acesso: senha = nome completo junto e minúsculo
    if public.athlete_initial_password(p_password) = ''
       or public.athlete_initial_password(p_password) <> public.athlete_initial_password(v_athlete.nome) then
      raise exception 'credenciais_invalidas';
    end if;
  elsif v_hash <> extensions.crypt(coalesce(p_password, ''), v_hash) then
    raise exception 'credenciais_invalidas';
  end if;

  delete from public.athlete_sessions where expires_at < now();

  insert into public.athlete_sessions (athlete_id)
  values (v_athlete.id)
  returning token into v_token;

  return public._athlete_session_json(v_token, v_athlete);
end;
$$;

-- Retoma uma sessão salva no aparelho (null se expirou/foi encerrada).
create or replace function public.athlete_get_session(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes;
begin
  begin
    v_athlete := public._athlete_from_token(p_token);
  exception when others then
    return null;
  end;

  return public._athlete_session_json(p_token, v_athlete);
end;
$$;

-- Define a nova senha no primeiro acesso (ou após reset pelo treinador).
create or replace function public.athlete_set_password(p_token uuid, p_new_password text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes;
begin
  v_athlete := public._athlete_from_token(p_token);

  if exists (select 1 from public.athlete_credentials c where c.athlete_id = v_athlete.id) then
    raise exception 'senha_ja_definida';
  end if;

  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'senha_curta';
  end if;

  if public.athlete_initial_password(p_new_password) = public.athlete_initial_password(v_athlete.nome) then
    raise exception 'senha_igual_inicial';
  end if;

  insert into public.athlete_credentials (athlete_id, password_hash)
  values (v_athlete.id, extensions.crypt(p_new_password, extensions.gen_salt('bf')));

  return public._athlete_session_json(p_token, v_athlete);
end;
$$;

-- Encerra a sessão (botão "Sair").
create or replace function public.athlete_logout(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.athlete_sessions where token = p_token;
$$;

-- Envio de PSE pelo atleta logado.
create or replace function public.athlete_submit_pse(
  p_token uuid,
  p_date date,
  p_training_type text,
  p_rpe_score integer,
  p_did_not_train boolean,
  p_observations text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.pse_records (athlete_id, date, training_type, rpe_score, did_not_train, observations)
  values (
    public._athlete_ready(p_token),
    coalesce(p_date, current_date),
    p_training_type,
    p_rpe_score,
    coalesce(p_did_not_train, false),
    p_observations
  );
end;
$$;

-- Envio de PSR pelo atleta logado.
create or replace function public.athlete_submit_psr(
  p_token uuid,
  p_date date,
  p_psr_score integer,
  p_fatigue_score integer,
  p_sleep_score integer,
  p_muscle_soreness_score integer,
  p_stress_score integer,
  p_mood_score integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.psr_records (
    athlete_id, date, psr_score, fatigue_score, sleep_score,
    muscle_soreness_score, stress_score, mood_score
  )
  values (
    public._athlete_ready(p_token),
    coalesce(p_date, current_date),
    p_psr_score, p_fatigue_score, p_sleep_score,
    p_muscle_soreness_score, p_stress_score, p_mood_score
  );
end;
$$;

-- Envio de peso pelo atleta logado.
create or replace function public.athlete_submit_weight(p_token uuid, p_date date, p_weight numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.weight_records (athlete_id, date, weight)
  values (public._athlete_ready(p_token), coalesce(p_date, current_date), p_weight);
end;
$$;

-- Treinador volta a senha do atleta para a inicial (atleta esqueceu a senha).
create or replace function public.coach_reset_athlete_password(p_athlete_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'nao_autorizado';
  end if;

  delete from public.athlete_credentials where athlete_id = p_athlete_id;
  delete from public.athlete_sessions where athlete_id = p_athlete_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Permissões: quem pode chamar cada função
-- ------------------------------------------------------------
revoke execute on function public.athlete_initial_password(text) from public, anon, authenticated;
revoke execute on function public._athlete_session_json(uuid, public.athletes) from public, anon, authenticated;
revoke execute on function public._athlete_from_token(uuid) from public, anon, authenticated;
revoke execute on function public._athlete_ready(uuid) from public, anon, authenticated;
revoke execute on function public.coach_reset_athlete_password(uuid) from public, anon;

grant execute on function public.athlete_login(text, text) to anon, authenticated;
grant execute on function public.athlete_get_session(uuid) to anon, authenticated;
grant execute on function public.athlete_set_password(uuid, text) to anon, authenticated;
grant execute on function public.athlete_logout(uuid) to anon, authenticated;
grant execute on function public.athlete_submit_pse(uuid, date, text, integer, boolean, text) to anon, authenticated;
grant execute on function public.athlete_submit_psr(uuid, date, integer, integer, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.athlete_submit_weight(uuid, date, numeric) to anon, authenticated;
grant execute on function public.coach_reset_athlete_password(uuid) to authenticated;

-- Atualiza o cache da API para as novas funções aparecerem imediatamente.
notify pgrst, 'reload schema';
