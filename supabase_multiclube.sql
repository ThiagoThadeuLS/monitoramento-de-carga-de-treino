-- ============================================================
-- MIGRAÇÃO: PLATAFORMA MULTI-CLUBE (ETAPA 1 — BASE)
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Ordem: supabase_schema.sql (só na criação) -> supabase_login_atleta.sql
--        -> supabase_cronograma.sql -> ESTE ARQUIVO.
-- Pode ser executado mais de uma vez e NÃO apaga dados.
-- ⚠️ Se rodar este arquivo de novo, rode depois supabase_plataforma.sql
--    (ele redefine funções e regras daqui para o modo suporte e clubes novos).
-- ⚠️ E depois supabase_grupos.sql (ele redefine a leitura do cronograma pelo atleta).
-- ⚠️ Se rodar de novo supabase_login_atleta.sql ou supabase_cronograma.sql,
--    rode este arquivo logo depois (ele redefine funções daqueles arquivos
--    para separar os dados por clube).
--
-- O que faz:
--  * Cria clubes, donos da plataforma e treinadores (com clube e papel).
--  * Cria o clube "Minas Tênis Clube" e coloca nele TODOS os dados atuais.
--  * Contas de treinador que já existem viram admin do Minas.
--  * Todas as tabelas passam a ter clube, e cada treinador/atleta só vê
--    os dados do próprio clube (clube suspenso = sem acesso).
-- ============================================================

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

-- Contas que já existem viram admin do Minas
insert into public.coaches (user_id, club_id, nome, email, role)
select u.id,
       '00000000-0000-4000-8000-000000000001',
       coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
       lower(u.email),
       'admin'
from auth.users u
where not exists (select 1 from public.coaches c where c.user_id = u.id);

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

notify pgrst, 'reload schema';
