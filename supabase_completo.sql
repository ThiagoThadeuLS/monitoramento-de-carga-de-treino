-- ============================================================
-- MONITORAMENTO DE CARGA DE TREINO — BANCO COMPLETO (SUPABASE)
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole ESTE ARQUIVO INTEIRO -> Run.
--
-- * Serve para banco novo E para atualizar o banco atual.
-- * Pode ser executado quantas vezes quiser: NÃO apaga dados.
--   (única limpeza automática: treinos com mais de uma semana, regra do cronograma,
--    e registros de envio de lembretes com mais de 14 dias)
-- * Sempre que este arquivo mudar, rode ele inteiro de novo.
--
-- Partes:
--   0. Tabelas base (atletas, PSE, PSR, peso, adversários)
--   1. Login do atleta (CPF + senha)
--   2. Cronograma
--   3. Multi-clube (clubes, donos, treinadores)
--   4. Equipe (convites de treinadores)
--   5. Plataforma (área restrita, modo suporte, escudos)
--   6. Grupos de atletas e público dos treinos
--   7. Lembretes por notificação
--   8. Tutorial e cores do clube
--
-- Depois de rodar pela primeira vez: publicar a função "enviar-lembretes" e criar
-- o agendamento (passo a passo no fim da parte 7).
-- Dados fictícios para teste ficam à parte: supabase_dados_ficticios.sql
-- ============================================================


-- ############################################################
-- PARTE 0. TABELAS BASE
-- ############################################################
create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  classe text,
  categoria text,
  celular text,
  sexo text,
  active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.pse_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  training_type text,
  did_not_train boolean default false not null,
  rpe_score integer check (rpe_score >= 1 and rpe_score <= 10 or rpe_score is null),
  observations text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.psr_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  psr_score integer not null check (psr_score >= 1 and psr_score <= 10),
  fatigue_score integer not null check (fatigue_score >= 1 and fatigue_score <= 10),
  sleep_score integer not null check (sleep_score >= 1 and sleep_score <= 10),
  muscle_soreness_score integer not null check (muscle_soreness_score >= 1 and muscle_soreness_score <= 10),
  stress_score integer not null check (stress_score >= 1 and stress_score <= 10),
  mood_score integer not null check (mood_score >= 1 and mood_score <= 10),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.weight_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  weight numeric(5,2) not null check (weight >= 30 and weight <= 250),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Atletas adversários (ficha de outros clubes/países)
create table if not exists public.adversarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria_peso text not null,
  classe_idade text not null,
  tipo_origem text not null,
  origem_valor text not null,
  observacao text,
  created_at timestamp with time zone default now() not null
);

alter table public.athletes enable row level security;
alter table public.pse_records enable row level security;
alter table public.psr_records enable row level security;
alter table public.weight_records enable row level security;
alter table public.adversarios enable row level security;


-- ############################################################
-- PARTE 1. LOGIN DO ATLETA
-- ############################################################

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


-- ############################################################
-- PARTE 2. CRONOGRAMA
-- ############################################################

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time,
  name text not null check (length(trim(name)) > 0),
  training_type text not null check (training_type in ('Treino Técnico', 'Treino Randori', 'Treino Físico')),
  expected_pse integer not null check (expected_pse between 1 and 10),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint training_sessions_horario check (end_time is null or end_time > start_time)
);

create index if not exists training_sessions_date_idx on public.training_sessions (date, start_time);

-- Mantém updated_at atualizado em cada edição
create or replace function public.training_sessions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists training_sessions_touch on public.training_sessions;
create trigger training_sessions_touch
  before update on public.training_sessions
  for each row execute function public.training_sessions_touch();

alter table public.training_sessions enable row level security;
revoke all on public.training_sessions from anon;

drop policy if exists "Cronograma: acesso total para a comissão técnica" on public.training_sessions;
create policy "Cronograma: acesso total para a comissão técnica"
  on public.training_sessions for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Janela de programação (fuso de Brasília)
--   permitido: semana anterior, semana atual e a próxima
--   mais antigo que a semana anterior: apagado
-- ------------------------------------------------------------
create or replace function public.training_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.training_week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

create or replace function public.training_sessions_check_window()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_week date := public.training_week_start(public.training_today());
begin
  -- Programar só até o fim da próxima semana
  if new.date > v_week + 13 then
    raise exception 'fora_da_janela: só é possível programar até a próxima semana';
  end if;
  -- Datas antes da semana anterior já não são guardadas
  if new.date < v_week - 7 then
    raise exception 'fora_da_janela: a data é anterior à semana passada';
  end if;
  return new;
end;
$$;

drop trigger if exists training_sessions_check_window on public.training_sessions;
create trigger training_sessions_check_window
  before insert or update on public.training_sessions
  for each row execute function public.training_sessions_check_window();

-- Apaga o que for mais antigo que a semana anterior. Devolve quantos apagou.
create or replace function public.purge_old_training_sessions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.training_sessions
  where date < public.training_week_start(public.training_today()) - 7;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_old_training_sessions() from public, anon;
grant execute on function public.purge_old_training_sessions() to authenticated;

-- Limpeza já agora e, se o pg_cron estiver ativo no projeto, toda segunda às 03h (Brasília).
-- Sem pg_cron, o app faz a limpeza sempre que o cronograma é aberto.
select public.purge_old_training_sessions();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpar-cronograma-antigo', '0 6 * * 1', 'select public.purge_old_training_sessions()');
  end if;
exception when others then
  raise notice 'pg_cron não agendado: %', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- Atletas: somente leitura do cronograma
-- ------------------------------------------------------------
create or replace function public.athlete_get_schedule(p_token uuid, p_from date, p_to date)
returns table (
  id uuid,
  date date,
  start_time time,
  end_time time,
  name text,
  training_type text,
  expected_pse integer,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._athlete_ready(p_token);

  return query
    select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse, s.notes
    from public.training_sessions s
    where s.date between p_from and p_to
      and s.date >= public.training_week_start(public.training_today()) - 7
    order by s.date, s.start_time;
end;
$$;

revoke execute on function public.athlete_get_schedule(uuid, date, date) from public;
grant execute on function public.athlete_get_schedule(uuid, date, date) to anon, authenticated;


-- ############################################################
-- PARTE 3. MULTI-CLUBE
-- ############################################################

-- ------------------------------------------------------------
-- 1. Clubes, donos da plataforma e treinadores
-- ------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  escudo_url text,
  status text not null default 'ativo' check (status in ('ativo', 'suspenso')),
  created_at timestamp with time zone default now() not null
);

create table if not exists public.platform_owners (
  email text primary key check (email = lower(email))
);

insert into public.platform_owners (email) values
  ('thiagothadeu11@gmail.com'),
  ('gabrielalmeida99@gmail.com')
on conflict do nothing;

create table if not exists public.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'treinador' check (role in ('admin', 'treinador')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamp with time zone default now() not null
);

create index if not exists coaches_club_idx on public.coaches (club_id);

-- Clube inicial (id fixo para o arquivo poder rodar de novo)
insert into public.clubs (id, nome, escudo_url)
values ('00000000-0000-4000-8000-000000000001', 'Minas Tênis Clube', '/minas-tenis-clube.svg')
on conflict (id) do nothing;

-- Contas que já existem viram admin do Minas (só na primeira migração, quando ainda não há treinadores)
insert into public.coaches (user_id, club_id, nome, email, role)
select u.id,
       '00000000-0000-4000-8000-000000000001',
       coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
       lower(u.email),
       'admin'
from auth.users u
where not exists (select 1 from public.coaches c where c.user_id = u.id)
  and not exists (select 1 from public.coaches);

-- ------------------------------------------------------------
-- 2. Quem está logado (usadas pelas regras de acesso)
-- ------------------------------------------------------------

-- Clube do treinador logado (null se não for treinador ativo de clube ativo)
create or replace function public.current_club_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.club_id
  from public.coaches c
  join public.clubs k on k.id = c.club_id
  where c.user_id = auth.uid()
    and c.active
    and k.status = 'ativo';
$$;

create or replace function public.is_club_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coaches c
    join public.clubs k on k.id = c.club_id
    where c.user_id = auth.uid() and c.active and c.role = 'admin' and k.status = 'ativo'
  );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.platform_owners o on o.email = lower(u.email)
    where u.id = auth.uid()
  );
$$;

-- Perfil do treinador logado + clube (o app usa para montar o cabeçalho e as permissões)
create or replace function public.my_profile()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'is_owner', public.is_platform_owner(),
    'coach', (
      select json_build_object(
        'nome', c.nome,
        'email', c.email,
        'role', c.role,
        'active', c.active,
        'must_change_password', c.must_change_password,
        'club', json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url, 'status', k.status)
      )
      from public.coaches c
      join public.clubs k on k.id = c.club_id
      where c.user_id = auth.uid()
    )
  );
$$;

revoke execute on function public.current_club_id() from public, anon;
revoke execute on function public.is_club_admin() from public, anon;
revoke execute on function public.is_platform_owner() from public, anon;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.current_club_id() to authenticated;
grant execute on function public.is_club_admin() to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.my_profile() to authenticated;

-- ------------------------------------------------------------
-- 3. Todas as tabelas de dados ganham clube (dados atuais -> Minas)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['athletes', 'pse_records', 'psr_records', 'weight_records', 'training_sessions', 'adversarios']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela % não existe, pulando', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists club_id uuid references public.clubs(id) on delete cascade', t);
    execute format('update public.%I set club_id = %L where club_id is null', t, '00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column club_id set not null', t);
    -- Treinador criando registro: clube dele por padrão
    execute format('alter table public.%I alter column club_id set default public.current_club_id()', t);
    execute format('create index if not exists %I on public.%I (club_id)', t || '_club_idx', t);
  end loop;
end $$;

-- Respostas sempre ficam no clube do atleta (vale para o atleta e para o treinador)
create or replace function public.records_set_club()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.club_id into new.club_id from public.athletes a where a.id = new.athlete_id;
  return new;
end;
$$;

drop trigger if exists pse_records_set_club on public.pse_records;
create trigger pse_records_set_club before insert or update of athlete_id on public.pse_records
  for each row execute function public.records_set_club();
drop trigger if exists psr_records_set_club on public.psr_records;
create trigger psr_records_set_club before insert or update of athlete_id on public.psr_records
  for each row execute function public.records_set_club();
drop trigger if exists weight_records_set_club on public.weight_records;
create trigger weight_records_set_club before insert or update of athlete_id on public.weight_records
  for each row execute function public.records_set_club();

-- ------------------------------------------------------------
-- 4. Regras de acesso: cada treinador só vê o próprio clube
-- ------------------------------------------------------------
drop policy if exists "Acesso total a atletas para autenticados" on public.athletes;
drop policy if exists "Acesso total a PSE para autenticados" on public.pse_records;
drop policy if exists "Acesso total a PSR para autenticados" on public.psr_records;
drop policy if exists "Acesso total a Peso para autenticados" on public.weight_records;
drop policy if exists "Cronograma: acesso total para a comissão técnica" on public.training_sessions;

do $$
declare
  t text;
  p record;
begin
  -- adversarios foi criada direto no painel: troca as regras dela pelas do clube
  if to_regclass('public.adversarios') is not null then
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'adversarios' loop
      execute format('drop policy %I on public.adversarios', p.policyname);
    end loop;
    execute 'alter table public.adversarios enable row level security';
    execute 'revoke all on public.adversarios from anon';
  end if;

  foreach t in array array['athletes', 'pse_records', 'psr_records', 'weight_records', 'training_sessions', 'adversarios']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'Clube: acesso da comissão técnica', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (club_id = public.current_club_id())
         with check (club_id = public.current_club_id())',
      'Clube: acesso da comissão técnica', t);
  end loop;
end $$;

alter table public.clubs enable row level security;
alter table public.platform_owners enable row level security;
alter table public.coaches enable row level security;
revoke all on public.clubs, public.platform_owners, public.coaches from anon;

drop policy if exists "Clube: treinador vê o próprio clube" on public.clubs;
create policy "Clube: treinador vê o próprio clube" on public.clubs
  for select to authenticated using (id = public.current_club_id());

drop policy if exists "Equipe: treinador vê colegas do clube" on public.coaches;
create policy "Equipe: treinador vê colegas do clube" on public.coaches
  for select to authenticated using (club_id = public.current_club_id());
-- platform_owners: sem políticas (só as funções acima leem)

-- ------------------------------------------------------------
-- 5. Funções dos atletas e do cronograma, agora por clube
-- ------------------------------------------------------------

-- Atleta só é válido se o clube dele estiver ativo
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
  join public.clubs k on k.id = a.club_id
  where s.token = p_token
    and s.expires_at > now()
    and a.active
    and k.status = 'ativo';

  if not found then
    raise exception 'sessao_invalida';
  end if;

  return v_athlete;
end;
$$;

-- Sessão do atleta também traz o clube (nome e escudo no cabeçalho)
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
    ),
    'club', (
      select json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url)
      from public.clubs k where k.id = p_athlete.club_id
    )
  );
$$;

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
  select a.* into v_athlete
  from public.athletes a
  join public.clubs k on k.id = a.club_id
  where a.cpf = regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g')
    and a.active
    and k.status = 'ativo';

  if not found then
    raise exception 'credenciais_invalidas';
  end if;

  select password_hash into v_hash
  from public.athlete_credentials
  where athlete_id = v_athlete.id;

  if v_hash is null then
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

-- Cronograma: atleta vê só os treinos do próprio clube
create or replace function public.athlete_get_schedule(p_token uuid, p_from date, p_to date)
returns table (
  id uuid,
  date date,
  start_time time,
  end_time time,
  name text,
  training_type text,
  expected_pse integer,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  select a.club_id into v_club from public.athletes a where a.id = public._athlete_ready(p_token);

  return query
    select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse, s.notes
    from public.training_sessions s
    where s.club_id = v_club
      and s.date between p_from and p_to
      and s.date >= public.training_week_start(public.training_today()) - 7
    order by s.date, s.start_time;
end;
$$;

-- Treinador só redefine senha de atleta do próprio clube
create or replace function public.coach_reset_athlete_password(p_athlete_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.athletes a
    where a.id = p_athlete_id and a.club_id = public.current_club_id()
  ) then
    raise exception 'nao_autorizado';
  end if;

  delete from public.athlete_credentials where athlete_id = p_athlete_id;
  delete from public.athlete_sessions where athlete_id = p_athlete_id;
end;
$$;

-- Limpeza do cronograma: só treinador ativo pode disparar
create or replace function public.purge_old_training_sessions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.current_club_id() is null and auth.uid() is not null then
    raise exception 'nao_autorizado';
  end if;
  delete from public.training_sessions
  where date < public.training_week_start(public.training_today()) - 7;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.records_set_club() from public, anon, authenticated;
revoke execute on function public._athlete_session_json(uuid, public.athletes) from public, anon, authenticated;
revoke execute on function public._athlete_from_token(uuid) from public, anon, authenticated;
revoke execute on function public.coach_reset_athlete_password(uuid) from public, anon;
grant execute on function public.athlete_login(text, text) to anon, authenticated;
grant execute on function public.athlete_get_schedule(uuid, date, date) to anon, authenticated;
grant execute on function public.coach_reset_athlete_password(uuid) to authenticated;


-- ############################################################
-- PARTE 4. EQUIPE
-- ############################################################

create table if not exists public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  kind text not null default 'coach' check (kind in ('coach', 'club')),
  club_id uuid references public.clubs(id) on delete cascade,   -- null em convite de clube novo (etapa 3)
  email text not null check (email = lower(email)),
  nome text,
  role text not null default 'treinador' check (role in ('admin', 'treinador')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  used_by uuid,
  canceled_at timestamp with time zone
);

create index if not exists coach_invites_email_idx on public.coach_invites (email);

alter table public.coach_invites enable row level security;
revoke all on public.coach_invites from anon, authenticated;
-- sem políticas: só as funções abaixo acessam

-- ------------------------------------------------------------
-- 1. Admin cadastra treinador -> convite interno (15 minutos)
-- ------------------------------------------------------------
create or replace function public.club_add_coach(p_nome text, p_email text, p_role text default 'treinador')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token uuid;
begin
  if not public.is_club_admin() then
    raise exception 'nao_autorizado';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'nome_obrigatorio';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;
  if p_role not in ('admin', 'treinador') then
    raise exception 'papel_invalido';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'email_ja_cadastrado';
  end if;

  -- cancela convites anteriores ainda abertos para o mesmo e-mail
  update public.coach_invites
     set canceled_at = now()
   where email = v_email and used_at is null and canceled_at is null;

  insert into public.coach_invites (kind, club_id, email, nome, role, created_by, expires_at)
  values ('coach', public.current_club_id(), v_email, trim(p_nome), p_role, auth.uid(), now() + interval '15 minutes')
  returning token into v_token;

  return v_token;
end;
$$;

-- Se a criação da conta falhar no navegador, o convite é cancelado
create or replace function public.club_cancel_coach_invite(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.coach_invites
     set canceled_at = now()
   where token = p_token
     and used_at is null
     and club_id = public.current_club_id()
     and public.is_club_admin();
$$;

-- ------------------------------------------------------------
-- 2. Regra no cadastro do Supabase Auth
-- ------------------------------------------------------------
create or replace function public.auth_users_require_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.coach_invites;
  v_token uuid;
begin
  begin
    v_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;
  exception when others then
    v_token := null;
  end;

  select * into v_invite
  from public.coach_invites i
  where i.token = v_token
    and i.email = lower(new.email)
    and i.used_at is null
    and i.canceled_at is null
    and i.expires_at > now()
  for update;

  if found then
    update public.coach_invites set used_at = now(), used_by = new.id where id = v_invite.id;
  elsif not exists (select 1 from public.platform_owners o where o.email = lower(new.email)) then
    raise exception 'cadastro_sem_convite: novas contas só podem ser criadas por convite';
  end if;

  -- o código do convite não fica guardado no perfil do usuário
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_token';
  return new;
end;
$$;

-- Depois de criada a conta: liga ao clube como treinador
create or replace function public.auth_users_link_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.coach_invites;
begin
  select * into v_invite from public.coach_invites where used_by = new.id and kind = 'coach';
  if found then
    insert into public.coaches (user_id, club_id, nome, email, role, must_change_password)
    values (new.id, v_invite.club_id, coalesce(v_invite.nome, split_part(new.email, '@', 1)), lower(new.email), v_invite.role, true)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_require_invite on auth.users;
create trigger auth_users_require_invite
  before insert on auth.users
  for each row execute function public.auth_users_require_invite();

drop trigger if exists auth_users_link_coach on auth.users;
create trigger auth_users_link_coach
  after insert on auth.users
  for each row execute function public.auth_users_link_coach();

-- ------------------------------------------------------------
-- 3. Gestão da equipe (somente admin do clube)
-- ------------------------------------------------------------

-- Garante que o clube nunca fica sem nenhum admin ativo
create or replace function public._club_keeps_admin(p_club uuid, p_user uuid, p_new_role text, p_new_active boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c
    where c.club_id = p_club
      and c.role = 'admin'
      and c.active
      and c.user_id <> p_user
  ) or (p_new_role = 'admin' and p_new_active);
$$;

create or replace function public.club_set_coach_role(p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coach public.coaches;
begin
  if not public.is_club_admin() then raise exception 'nao_autorizado'; end if;
  if p_role not in ('admin', 'treinador') then raise exception 'papel_invalido'; end if;

  select * into v_coach from public.coaches where user_id = p_user_id and club_id = public.current_club_id();
  if not found then raise exception 'nao_autorizado'; end if;

  if not public._club_keeps_admin(v_coach.club_id, p_user_id, p_role, v_coach.active) then
    raise exception 'ultimo_admin';
  end if;

  update public.coaches set role = p_role where user_id = p_user_id;
end;
$$;

create or replace function public.club_set_coach_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coach public.coaches;
begin
  if not public.is_club_admin() then raise exception 'nao_autorizado'; end if;

  select * into v_coach from public.coaches where user_id = p_user_id and club_id = public.current_club_id();
  if not found then raise exception 'nao_autorizado'; end if;

  if not public._club_keeps_admin(v_coach.club_id, p_user_id, v_coach.role, p_active) then
    raise exception 'ultimo_admin';
  end if;

  update public.coaches set active = p_active where user_id = p_user_id;
end;
$$;

-- Treinador avisa que já trocou a senha temporária
create or replace function public.coach_password_changed()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.coaches set must_change_password = false where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 4. Permissões
-- ------------------------------------------------------------
revoke execute on function public.auth_users_require_invite() from public, anon, authenticated;
revoke execute on function public.auth_users_link_coach() from public, anon, authenticated;
revoke execute on function public._club_keeps_admin(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.club_add_coach(text, text, text) from public, anon;
revoke execute on function public.club_cancel_coach_invite(uuid) from public, anon;
revoke execute on function public.club_set_coach_role(uuid, text) from public, anon;
revoke execute on function public.club_set_coach_active(uuid, boolean) from public, anon;
revoke execute on function public.coach_password_changed() from public, anon;
grant execute on function public.club_add_coach(text, text, text) to authenticated;
grant execute on function public.club_cancel_coach_invite(uuid) to authenticated;
grant execute on function public.club_set_coach_role(uuid, text) to authenticated;
grant execute on function public.club_set_coach_active(uuid, boolean) to authenticated;
grant execute on function public.coach_password_changed() to authenticated;


-- ############################################################
-- PARTE 5. PLATAFORMA
-- ############################################################

-- ------------------------------------------------------------
-- 1. Modo suporte + registro de acessos
-- ------------------------------------------------------------
create table if not exists public.owner_support_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  started_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null
);

create table if not exists public.owner_access_log (
  id bigint generated always as identity primary key,
  owner_user_id uuid,
  owner_email text,
  club_id uuid references public.clubs(id) on delete set null,
  club_nome text,
  action text not null,   -- entrou_suporte | saiu_suporte | suspendeu | reativou | convidou
  detail text,
  at timestamp with time zone default now() not null
);

alter table public.owner_support_sessions enable row level security;
alter table public.owner_access_log enable row level security;
revoke all on public.owner_support_sessions, public.owner_access_log from anon, authenticated;
-- sem políticas: só as funções abaixo acessam

-- Clube que o dono está vendo em modo suporte (null fora do modo suporte)
create or replace function public.support_club_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.club_id
  from public.owner_support_sessions s
  where s.user_id = auth.uid()
    and s.expires_at > now()
    and public.is_platform_owner();
$$;

-- Clube "em uso": o do modo suporte (se houver) ou o do treinador
create or replace function public.current_club_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.support_club_id(),
    (select c.club_id
       from public.coaches c
       join public.clubs k on k.id = c.club_id
      where c.user_id = auth.uid() and c.active and k.status = 'ativo')
  );
$$;

-- Admin do clube (nunca em modo suporte: suporte é só leitura)
create or replace function public.is_club_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.support_club_id() is null
     and exists (
       select 1
       from public.coaches c
       join public.clubs k on k.id = c.club_id
       where c.user_id = auth.uid() and c.active and c.role = 'admin' and k.status = 'ativo'
     );
$$;

create or replace function public._owner_log(p_club uuid, p_action text, p_detail text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.owner_access_log (owner_user_id, owner_email, club_id, club_nome, action, detail)
  select auth.uid(),
         (select lower(u.email) from auth.users u where u.id = auth.uid()),
         p_club,
         (select k.nome from public.clubs k where k.id = p_club),
         p_action,
         p_detail;
$$;

-- ------------------------------------------------------------
-- 2. Regras de acesso: leitura no clube em uso; escrita fora do modo suporte
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['athletes', 'pse_records', 'psr_records', 'weight_records', 'training_sessions', 'adversarios']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'Clube: acesso da comissão técnica', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: leitura', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: inclusão', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: alteração', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: exclusão', t);
    execute format('create policy %I on public.%I for select to authenticated using (club_id = public.current_club_id())', 'Clube: leitura', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (club_id = public.current_club_id() and public.support_club_id() is null)', 'Clube: inclusão', t);
    execute format('create policy %I on public.%I for update to authenticated using (club_id = public.current_club_id() and public.support_club_id() is null) with check (club_id = public.current_club_id())', 'Clube: alteração', t);
    execute format('create policy %I on public.%I for delete to authenticated using (club_id = public.current_club_id() and public.support_club_id() is null)', 'Clube: exclusão', t);
  end loop;
end $$;

-- Redefinir senha de atleta é escrita: bloqueada em modo suporte
create or replace function public.coach_reset_athlete_password(p_athlete_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.support_club_id() is not null
     or not exists (
       select 1 from public.athletes a
       where a.id = p_athlete_id and a.club_id = public.current_club_id()
     ) then
    raise exception 'nao_autorizado';
  end if;

  delete from public.athlete_credentials where athlete_id = p_athlete_id;
  delete from public.athlete_sessions where athlete_id = p_athlete_id;
end;
$$;

-- Perfil agora informa o modo suporte
create or replace function public.my_profile()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'is_owner', public.is_platform_owner(),
    'support', (
      select json_build_object(
        'club', json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url, 'status', k.status),
        'expires_at', s.expires_at
      )
      from public.owner_support_sessions s
      join public.clubs k on k.id = s.club_id
      where s.user_id = auth.uid() and s.expires_at > now() and public.is_platform_owner()
    ),
    'coach', (
      select json_build_object(
        'nome', c.nome,
        'email', c.email,
        'role', c.role,
        'active', c.active,
        'must_change_password', c.must_change_password,
        'club', json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url, 'status', k.status)
      )
      from public.coaches c
      join public.clubs k on k.id = c.club_id
      where c.user_id = auth.uid()
    )
  );
$$;

-- ------------------------------------------------------------
-- 3. Convite de clube novo
-- ------------------------------------------------------------
create or replace function public.owner_create_club_invite(p_email text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite public.coach_invites;
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then raise exception 'email_ja_cadastrado'; end if;

  update public.coach_invites
     set canceled_at = now()
   where email = v_email and kind = 'club' and used_at is null and canceled_at is null;

  insert into public.coach_invites (kind, email, role, created_by, expires_at)
  values ('club', v_email, 'admin', auth.uid(), now() + interval '7 days')
  returning * into v_invite;

  perform public._owner_log(null, 'convidou', v_email);
  return json_build_object('token', v_invite.token, 'expires_at', v_invite.expires_at);
end;
$$;

create or replace function public.owner_cancel_club_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  update public.coach_invites
     set canceled_at = now()
   where id = p_id and kind = 'club' and used_at is null and canceled_at is null;
end;
$$;

create or replace function public.owner_list_club_invites()
returns table (
  id uuid,
  email text,
  token uuid,
  status text,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  used_at timestamp with time zone,
  club_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  return query
    select i.id, i.email,
           case when i.used_at is null and i.canceled_at is null and i.expires_at > now() then i.token end,
           case
             when i.used_at is not null then 'usado'
             when i.canceled_at is not null then 'cancelado'
             when i.expires_at <= now() then 'expirado'
             else 'pendente'
           end,
           i.created_at, i.expires_at, i.used_at, k.nome
    from public.coach_invites i
    left join public.clubs k on k.id = i.club_id
    where i.kind = 'club'
    order by i.created_at desc
    limit 50;
end;
$$;

-- Tela pública do convite: mostra o e-mail só para um código válido
create or replace function public.club_invite_info(p_token uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('email', i.email, 'expires_at', i.expires_at)
  from public.coach_invites i
  where i.token = p_token
    and i.kind = 'club'
    and i.used_at is null
    and i.canceled_at is null
    and i.expires_at > now();
$$;

-- Conta criada: convite de treinador liga ao clube; convite de clube cria o clube
create or replace function public.auth_users_link_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.coach_invites;
  v_club uuid;
  v_nome text := nullif(trim(new.raw_user_meta_data->>'nome'), '');
begin
  select * into v_invite from public.coach_invites where used_by = new.id;
  if not found then
    return new;
  end if;

  if v_invite.kind = 'club' then
    insert into public.clubs (nome)
    values (coalesce(nullif(left(trim(new.raw_user_meta_data->>'club_nome'), 120), ''), 'Novo clube'))
    returning id into v_club;
    update public.coach_invites set club_id = v_club where id = v_invite.id;
    insert into public.coaches (user_id, club_id, nome, email, role, must_change_password)
    values (new.id, v_club, coalesce(v_nome, split_part(new.email, '@', 1)), lower(new.email), 'admin', false)
    on conflict (user_id) do nothing;
  else
    insert into public.coaches (user_id, club_id, nome, email, role, must_change_password)
    values (new.id, v_invite.club_id, coalesce(v_invite.nome, v_nome, split_part(new.email, '@', 1)), lower(new.email), v_invite.role, true)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Clubes: lista, suspender/reativar, modo suporte
-- ------------------------------------------------------------
create or replace function public.owner_list_clubs()
returns table (
  id uuid,
  nome text,
  escudo_url text,
  status text,
  created_at timestamp with time zone,
  treinadores integer,
  atletas integer,
  admins text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  return query
    select k.id, k.nome, k.escudo_url, k.status, k.created_at,
           (select count(*)::int from public.coaches c where c.club_id = k.id and c.active),
           (select count(*)::int from public.athletes a where a.club_id = k.id and a.active),
           (select string_agg(c.email, ', ' order by c.email) from public.coaches c where c.club_id = k.id and c.role = 'admin' and c.active)
    from public.clubs k
    order by k.created_at;
end;
$$;

create or replace function public.owner_set_club_status(p_club_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  if p_status not in ('ativo', 'suspenso') then raise exception 'status_invalido'; end if;
  update public.clubs set status = p_status where id = p_club_id;
  if not found then raise exception 'clube_nao_encontrado'; end if;
  perform public._owner_log(p_club_id, case when p_status = 'suspenso' then 'suspendeu' else 'reativou' end);
end;
$$;

create or replace function public.owner_enter_support(p_club_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then raise exception 'clube_nao_encontrado'; end if;
  insert into public.owner_support_sessions (user_id, club_id, expires_at)
  values (auth.uid(), p_club_id, now() + interval '2 hours')
  on conflict (user_id) do update set club_id = excluded.club_id, started_at = now(), expires_at = excluded.expires_at;
  perform public._owner_log(p_club_id, 'entrou_suporte');
end;
$$;

create or replace function public.owner_exit_support()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  delete from public.owner_support_sessions where user_id = auth.uid() returning club_id into v_club;
  if v_club is not null then
    perform public._owner_log(v_club, 'saiu_suporte');
  end if;
end;
$$;

create or replace function public.owner_list_access_log()
returns table (at timestamp with time zone, owner_email text, club_nome text, action text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then raise exception 'nao_autorizado'; end if;
  return query
    select l.at, l.owner_email, l.club_nome, l.action, l.detail
    from public.owner_access_log l
    order by l.at desc
    limit 50;
end;
$$;

-- ------------------------------------------------------------
-- 5. Escudos (Supabase Storage)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escudos', 'escudos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: o bucket já é público (escudo aparece para todos); o envio precisa ler o que gravou
drop policy if exists "Escudos: leitura" on storage.objects;
create policy "Escudos: leitura" on storage.objects
  for select to authenticated
  using (bucket_id = 'escudos');

drop policy if exists "Escudos: admin do clube envia" on storage.objects;
create policy "Escudos: admin do clube envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'escudos' and (storage.foldername(name))[1] = public.current_club_id()::text and public.is_club_admin());

drop policy if exists "Escudos: admin do clube substitui" on storage.objects;
create policy "Escudos: admin do clube substitui" on storage.objects
  for update to authenticated
  using (bucket_id = 'escudos' and (storage.foldername(name))[1] = public.current_club_id()::text and public.is_club_admin());

drop policy if exists "Escudos: admin do clube apaga" on storage.objects;
create policy "Escudos: admin do clube apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'escudos' and (storage.foldername(name))[1] = public.current_club_id()::text and public.is_club_admin());

-- Admin grava o endereço do escudo (só arquivos do próprio clube no bucket)
create or replace function public.club_set_escudo(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_club uuid := public.current_club_id();
begin
  if not public.is_club_admin() then raise exception 'nao_autorizado'; end if;
  if p_url is null or position('/storage/v1/object/public/escudos/' || v_club::text || '/' in p_url) = 0 then
    raise exception 'escudo_invalido';
  end if;
  update public.clubs set escudo_url = p_url where id = v_club;
end;
$$;

-- ------------------------------------------------------------
-- 6. Permissões
-- ------------------------------------------------------------
revoke execute on function public.support_club_id() from public, anon;
revoke execute on function public._owner_log(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.owner_create_club_invite(text) from public, anon;
revoke execute on function public.owner_cancel_club_invite(uuid) from public, anon;
revoke execute on function public.owner_list_club_invites() from public, anon;
revoke execute on function public.owner_list_clubs() from public, anon;
revoke execute on function public.owner_set_club_status(uuid, text) from public, anon;
revoke execute on function public.owner_enter_support(uuid) from public, anon;
revoke execute on function public.owner_exit_support() from public, anon;
revoke execute on function public.owner_list_access_log() from public, anon;
revoke execute on function public.club_set_escudo(text) from public, anon;
revoke execute on function public.club_invite_info(uuid) from public;
grant execute on function public.support_club_id() to authenticated;
grant execute on function public.owner_create_club_invite(text) to authenticated;
grant execute on function public.owner_cancel_club_invite(uuid) to authenticated;
grant execute on function public.owner_list_club_invites() to authenticated;
grant execute on function public.owner_list_clubs() to authenticated;
grant execute on function public.owner_set_club_status(uuid, text) to authenticated;
grant execute on function public.owner_enter_support(uuid) to authenticated;
grant execute on function public.owner_exit_support() to authenticated;
grant execute on function public.owner_list_access_log() to authenticated;
grant execute on function public.club_set_escudo(text) to authenticated;
grant execute on function public.club_invite_info(uuid) to anon, authenticated;


-- ############################################################
-- PARTE 6. GRUPOS
-- ############################################################

-- ------------------------------------------------------------
-- 1. Grupos e participantes
-- ------------------------------------------------------------
create table if not exists public.athlete_groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  created_at timestamp with time zone default now() not null
);

create unique index if not exists athlete_groups_nome_unico on public.athlete_groups (club_id, lower(trim(nome)));

create table if not exists public.athlete_group_members (
  group_id uuid not null references public.athlete_groups(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  primary key (group_id, athlete_id)
);

create index if not exists athlete_group_members_athlete_idx on public.athlete_group_members (athlete_id);

-- Participante: grupo e atleta precisam ser do mesmo clube; o clube vem do grupo
create or replace function public.group_members_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  select g.club_id into v_club from public.athlete_groups g where g.id = new.group_id;
  if not exists (select 1 from public.athletes a where a.id = new.athlete_id and a.club_id = v_club) then
    raise exception 'atleta_de_outro_clube';
  end if;
  new.club_id := v_club;
  return new;
end;
$$;

drop trigger if exists group_members_check on public.athlete_group_members;
create trigger group_members_check before insert or update on public.athlete_group_members
  for each row execute function public.group_members_check();

-- ------------------------------------------------------------
-- 2. Público de cada treino
-- ------------------------------------------------------------
alter table public.training_sessions add column if not exists audience text not null default 'todos';
alter table public.training_sessions add column if not exists target_group_ids uuid[] not null default '{}';
alter table public.training_sessions add column if not exists target_athlete_ids uuid[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_sessions_audience_check') then
    alter table public.training_sessions
      add constraint training_sessions_audience_check check (audience in ('todos', 'incluir', 'exceto'));
  end if;
end $$;

-- Público coerente e sempre do mesmo clube do treino
create or replace function public.training_sessions_check_audience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'todos' then
    new.target_group_ids := '{}';
    new.target_athlete_ids := '{}';
    return new;
  end if;

  new.target_group_ids := coalesce(new.target_group_ids, '{}');
  new.target_athlete_ids := coalesce(new.target_athlete_ids, '{}');

  if cardinality(new.target_group_ids) + cardinality(new.target_athlete_ids) = 0 then
    raise exception 'publico_vazio';
  end if;
  if exists (
    select 1 from unnest(new.target_group_ids) gid
    where not exists (select 1 from public.athlete_groups g where g.id = gid and g.club_id = new.club_id)
  ) then
    raise exception 'grupo_de_outro_clube';
  end if;
  if exists (
    select 1 from unnest(new.target_athlete_ids) aid
    where not exists (select 1 from public.athletes a where a.id = aid and a.club_id = new.club_id)
  ) then
    raise exception 'atleta_de_outro_clube';
  end if;
  return new;
end;
$$;

drop trigger if exists training_sessions_check_audience on public.training_sessions;
create trigger training_sessions_check_audience before insert or update on public.training_sessions
  for each row execute function public.training_sessions_check_audience();

-- O treino é para este atleta?
create or replace function public.session_applies_to(p_session public.training_sessions, p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_session.audience
    when 'todos' then true
    else (
      p_athlete = any(p_session.target_athlete_ids)
      or exists (
        select 1 from public.athlete_group_members m
        where m.athlete_id = p_athlete and m.group_id = any(p_session.target_group_ids)
      )
    ) = (p_session.audience = 'incluir')
  end;
$$;

-- ------------------------------------------------------------
-- 3. Atleta: cronograma só com os treinos destinados a ele
-- ------------------------------------------------------------
create or replace function public.athlete_get_schedule(p_token uuid, p_from date, p_to date)
returns table (
  id uuid,
  date date,
  start_time time,
  end_time time,
  name text,
  training_type text,
  expected_pse integer,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
  v_club uuid;
begin
  v_athlete := public._athlete_ready(p_token);
  select a.club_id into v_club from public.athletes a where a.id = v_athlete;

  return query
    select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse, s.notes
    from public.training_sessions s
    where s.club_id = v_club
      and s.date between p_from and p_to
      and s.date >= public.training_week_start(public.training_today()) - 7
      and public.session_applies_to(s, v_athlete)
    order by s.date, s.start_time;
end;
$$;

-- ------------------------------------------------------------
-- 4. Regras de acesso (iguais às outras tabelas do clube)
-- ------------------------------------------------------------
alter table public.athlete_groups enable row level security;
alter table public.athlete_group_members enable row level security;
revoke all on public.athlete_groups, public.athlete_group_members from anon;

do $$
declare
  t text;
begin
  foreach t in array array['athlete_groups', 'athlete_group_members']
  loop
    execute format('drop policy if exists %I on public.%I', 'Clube: leitura', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: inclusão', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: alteração', t);
    execute format('drop policy if exists %I on public.%I', 'Clube: exclusão', t);
    execute format('create policy %I on public.%I for select to authenticated using (club_id = public.current_club_id())', 'Clube: leitura', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (club_id = public.current_club_id() and public.support_club_id() is null)', 'Clube: inclusão', t);
    execute format('create policy %I on public.%I for update to authenticated using (club_id = public.current_club_id() and public.support_club_id() is null) with check (club_id = public.current_club_id())', 'Clube: alteração', t);
    execute format('create policy %I on public.%I for delete to authenticated using (club_id = public.current_club_id() and public.support_club_id() is null)', 'Clube: exclusão', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. PSE: "não treinei" exige o motivo
--    (NOT VALID: vale para respostas novas; registros antigos não são barrados)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pse_motivo_nao_treinou') then
    alter table public.pse_records
      add constraint pse_motivo_nao_treinou
      check (not did_not_train or length(trim(coalesce(observations, ''))) > 0) not valid;
  end if;
end $$;

revoke execute on function public.group_members_check() from public, anon, authenticated;
revoke execute on function public.training_sessions_check_audience() from public, anon, authenticated;
revoke execute on function public.session_applies_to(public.training_sessions, uuid) from public, anon;
grant execute on function public.session_applies_to(public.training_sessions, uuid) to authenticated;
grant execute on function public.athlete_get_schedule(uuid, date, date) to anon, authenticated;


-- ############################################################
-- PARTE 7. LEMBRETES
-- ############################################################

-- ------------------------------------------------------------
-- 1. Aparelhos com lembretes ativados (assinaturas de push)
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_sent_at timestamp with time zone
);

create index if not exists push_subscriptions_athlete_idx on public.push_subscriptions (athlete_id);

-- Controle de envios (para repetir de 30 em 30 minutos)
create table if not exists public.reminder_log (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind text not null check (kind in ('pse', 'psr', 'peso')),
  ref text not null,                       -- treino (PSE) ou data (PSR/peso)
  first_sent_at timestamp with time zone default now() not null,
  last_sent_at timestamp with time zone default now() not null,
  sent_count integer not null default 1,
  primary key (athlete_id, kind, ref)
);

-- Dias e horário do lembrete de peso, por clube
create table if not exists public.club_reminder_settings (
  club_id uuid primary key default public.current_club_id() references public.clubs(id) on delete cascade,
  weight_days integer[] not null default '{}',   -- 1 = segunda ... 7 = domingo
  weight_time time not null default '07:00',
  notify_from time not null default '06:00',     -- janela em que as notificações podem sair
  notify_until time not null default '22:00',
  updated_at timestamp with time zone default now() not null,
  constraint club_reminder_settings_days check (weight_days <@ array[1, 2, 3, 4, 5, 6, 7])
);

-- Para quem já tinha rodado a versão anterior deste arquivo
alter table public.club_reminder_settings add column if not exists notify_from time not null default '06:00';
alter table public.club_reminder_settings add column if not exists notify_until time not null default '22:00';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'club_reminder_settings_janela') then
    alter table public.club_reminder_settings
      add constraint club_reminder_settings_janela check (notify_from < notify_until);
  end if;
end $$;

alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;
alter table public.club_reminder_settings enable row level security;
revoke all on public.push_subscriptions, public.reminder_log from anon, authenticated;
revoke all on public.club_reminder_settings from anon;

-- Treinador lê/edita as configurações do próprio clube (modo suporte: só leitura)
drop policy if exists "Clube: leitura" on public.club_reminder_settings;
drop policy if exists "Clube: inclusão" on public.club_reminder_settings;
drop policy if exists "Clube: alteração" on public.club_reminder_settings;
create policy "Clube: leitura" on public.club_reminder_settings
  for select to authenticated using (club_id = public.current_club_id());
create policy "Clube: inclusão" on public.club_reminder_settings
  for insert to authenticated with check (club_id = public.current_club_id() and public.support_club_id() is null);
create policy "Clube: alteração" on public.club_reminder_settings
  for update to authenticated
  using (club_id = public.current_club_id() and public.support_club_id() is null)
  with check (club_id = public.current_club_id());

-- ------------------------------------------------------------
-- 2. Atleta ativa/desativa os lembretes no aparelho
-- ------------------------------------------------------------
create or replace function public.athlete_save_push(
  p_token uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_athlete uuid := public._athlete_ready(p_token);
begin
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'assinatura_invalida';
  end if;
  -- o mesmo aparelho passa a ser do atleta logado nele
  insert into public.push_subscriptions (athlete_id, endpoint, p256dh, auth, user_agent)
  values (v_athlete, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set athlete_id = excluded.athlete_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.athlete_remove_push(p_token uuid, p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_athlete uuid := (public._athlete_from_token(p_token)).id;
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and athlete_id = v_athlete;
end;
$$;

-- Sair do app só encerra a sessão: o aparelho continua recebendo os lembretes (permanente)
create or replace function public.athlete_logout(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.athlete_sessions where token = p_token;
$$;

-- ------------------------------------------------------------
-- 3. Quais lembretes estão "vencidos" agora (usado pela função de envio)
-- ------------------------------------------------------------
create or replace function public.push_due_reminders(p_now timestamp with time zone default now())
returns table (athlete_id uuid, kind text, ref text, title text, body text, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_local timestamp := p_now at time zone 'America/Sao_Paulo';
  v_today date := v_local::date;
  v_time time := v_local::time;
begin
  return query
  with elegiveis as (
    -- atleta ativo, de clube ativo, com senha própria, com aparelho cadastrado
    -- e dentro da janela de horário do clube (padrão 06h às 22h)
    select a.id, a.club_id
    from public.athletes a
    join public.clubs k on k.id = a.club_id and k.status = 'ativo'
    left join public.club_reminder_settings w on w.club_id = a.club_id
    where a.active
      and v_time >= coalesce(w.notify_from, time '06:00')
      and v_time < coalesce(w.notify_until, time '22:00')
      and exists (select 1 from public.athlete_credentials c where c.athlete_id = a.id)
      and exists (select 1 from public.push_subscriptions ps where ps.athlete_id = a.id)
  ),
  treinos as (
    select e.id as athlete_id, s.*
    from elegiveis e
    join public.training_sessions s on s.club_id = e.club_id and s.date = v_today
    where public.session_applies_to(s, e.id)
  ),
  pse as (
    select t.athlete_id, 'pse'::text as kind, t.id::text as ref,
           'Registre sua PSE'::text as title,
           format('Como foi o %s? Leva só alguns segundos.', t.name) as body,
           '/?aba=pse'::text as url
    from treinos t
    where v_time >= coalesce(t.end_time, t.start_time + interval '90 minutes') + interval '20 minutes'
      and not exists (
        select 1 from public.pse_records p
        where p.athlete_id = t.athlete_id and p.date = v_today
          and (p.did_not_train
               or (p.training_type = t.training_type
                   and p.created_at >= ((v_today + t.start_time) at time zone 'America/Sao_Paulo')))
      )
  ),
  psr as (
    select f.athlete_id, 'psr'::text, v_today::text,
           'Como você está hoje?'::text,
           'Responda o bem-estar (PSR) antes do treino.'::text,
           '/?aba=psr'::text
    -- começa no início da janela de notificações do clube, se o atleta tem treino hoje
    from (select distinct t.athlete_id from treinos t) f
    where not exists (select 1 from public.psr_records r where r.athlete_id = f.athlete_id and r.date = v_today)
  ),
  peso as (
    select e.id, 'peso'::text, v_today::text,
           'Hora da pesagem'::text,
           'Registre seu peso de hoje no app.'::text,
           '/?aba=peso'::text
    from elegiveis e
    join public.club_reminder_settings cfg on cfg.club_id = e.club_id
    where extract(isodow from v_today)::int = any(cfg.weight_days)
      and v_time >= cfg.weight_time
      and not exists (select 1 from public.weight_records w where w.athlete_id = e.id and w.date = v_today)
  ),
  todos as (
    select * from pse union all select * from psr union all select * from peso
  )
  select x.athlete_id, x.kind, x.ref, x.title, x.body, x.url
  from todos x
  where not exists (
    select 1 from public.reminder_log l
    where l.athlete_id = x.athlete_id and l.kind = x.kind and l.ref = x.ref
      -- PSE/PSR: a cada 20 min; peso: a cada 30 min (1 min de folga para o agendamento de 5 em 5)
      and l.last_sent_at > p_now - case when x.kind = 'peso' then interval '29 minutes' else interval '19 minutes' end
  );
end;
$$;

-- Registra que o lembrete foi enviado (controla a repetição)
create or replace function public.push_mark_sent(p_athlete uuid, p_kind text, p_ref text, p_now timestamp with time zone default now())
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.reminder_log (athlete_id, kind, ref, first_sent_at, last_sent_at, sent_count)
  values (p_athlete, p_kind, p_ref, p_now, p_now, 1)
  on conflict (athlete_id, kind, ref) do update
    set last_sent_at = excluded.last_sent_at, sent_count = public.reminder_log.sent_count + 1;
$$;

-- ------------------------------------------------------------
-- 4. Permissões
-- ------------------------------------------------------------
revoke execute on function public.athlete_save_push(uuid, text, text, text, text) from public;
revoke execute on function public.athlete_remove_push(uuid, text) from public;
grant execute on function public.athlete_save_push(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.athlete_remove_push(uuid, text) to anon, authenticated;
grant execute on function public.athlete_logout(uuid) to anon, authenticated;

-- Só a função de envio (chave de serviço) usa estas duas
revoke execute on function public.push_due_reminders(timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.push_mark_sent(uuid, text, text, timestamp with time zone) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.push_due_reminders(timestamp with time zone) to service_role';
    execute 'grant execute on function public.push_mark_sent(uuid, text, text, timestamp with time zone) to service_role';
    execute 'grant all on public.push_subscriptions, public.reminder_log to service_role';
  end if;
end $$;

-- Limpeza: registros de envio com mais de 14 dias
delete from public.reminder_log where last_sent_at < now() - interval '14 days';


-- ============================================================
-- AGENDAMENTO (rodar UMA vez, depois de publicar a função enviar-lembretes)
-- Requer as extensões pg_cron e pg_net (Database -> Extensions).
-- Chama a função a cada 5 minutos:
--
--   select cron.schedule(
--     'enviar-lembretes',
--     '*/5 * * * *',
--     $job$ select net.http_post(
--       url := 'https://bdlwizqxbfocqsekdkkl.supabase.co/functions/v1/enviar-lembretes',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     ) $job$
--   );
--
-- Para parar:  select cron.unschedule('enviar-lembretes');
-- ============================================================


-- ############################################################
-- PARTE 8. TUTORIAL (PRIMEIRO ACESSO) E CORES DO CLUBE
-- ############################################################
alter table public.athletes add column if not exists tutorial_done_at timestamp with time zone;
alter table public.coaches add column if not exists tutorial_done_at timestamp with time zone;
alter table public.clubs add column if not exists theme jsonb;

-- Atleta: já viu o tutorial?
create or replace function public.athlete_tutorial_pending(p_token uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes := public._athlete_from_token(p_token);
begin
  return v_athlete.tutorial_done_at is null;
end;
$$;

create or replace function public.athlete_tutorial_done(p_token uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := (public._athlete_from_token(p_token)).id;
begin
  update public.athletes set tutorial_done_at = coalesce(tutorial_done_at, now()) where id = v_id;
end;
$$;

-- Treinador: já viu o tutorial?
create or replace function public.coach_tutorial_pending()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.tutorial_done_at is null from public.coaches c where c.user_id = auth.uid()), false);
$$;

create or replace function public.coach_tutorial_done()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.coaches set tutorial_done_at = coalesce(tutorial_done_at, now()) where user_id = auth.uid();
$$;

-- Cores do clube: qualquer um pode ler (são só cores); só o admin do clube altera
create or replace function public.club_theme(p_club uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select k.theme from public.clubs k where k.id = p_club;
$$;

create or replace function public.club_set_theme(p_accent text, p_base text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.support_club_id() is not null then
    raise exception 'modo_suporte';
  end if;
  if not public.is_club_admin() then
    raise exception 'somente_admin';
  end if;
  if p_accent is not null and (p_accent !~ '^#[0-9a-fA-F]{6}$' or coalesce(p_base, '') !~ '^#[0-9a-fA-F]{6}$') then
    raise exception 'cor_invalida';
  end if;
  update public.clubs
     set theme = case when p_accent is null then null
                      else jsonb_build_object('accent', lower(p_accent), 'base', lower(p_base)) end
   where id = public.current_club_id();
end;
$$;

revoke execute on function public.athlete_tutorial_pending(uuid) from public;
revoke execute on function public.athlete_tutorial_done(uuid) from public;
revoke execute on function public.coach_tutorial_pending() from public, anon;
revoke execute on function public.coach_tutorial_done() from public, anon;
revoke execute on function public.club_theme(uuid) from public;
revoke execute on function public.club_set_theme(text, text) from public, anon;
grant execute on function public.athlete_tutorial_pending(uuid) to anon, authenticated;
grant execute on function public.athlete_tutorial_done(uuid) to anon, authenticated;
grant execute on function public.coach_tutorial_pending() to authenticated;
grant execute on function public.coach_tutorial_done() to authenticated;
grant execute on function public.club_theme(uuid) to anon, authenticated;
grant execute on function public.club_set_theme(text, text) to authenticated;

notify pgrst, 'reload schema';
