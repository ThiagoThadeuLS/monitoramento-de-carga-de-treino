-- ============================================================
-- MIGRAÇÃO: GRUPOS DE ATLETAS + PÚBLICO DOS TREINOS
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_plataforma.sql (é o último da lista).
-- Pode ser executado mais de uma vez e NÃO apaga dados.
-- ⚠️ Se rodar de novo supabase_multiclube.sql, rode este arquivo depois
--    (ele redefine a leitura do cronograma pelo atleta).
--
-- O que faz:
--  * Grupos de atletas dentro do clube (um atleta pode estar em vários grupos).
--  * Cada treino do cronograma tem um público:
--      todos    -> todos os atletas do clube
--      incluir  -> somente os grupos e/ou atletas escolhidos
--      exceto   -> todos, menos os grupos e/ou atletas escolhidos
--  * O atleta só recebe os treinos destinados a ele.
--  * Treinos que já existem ficam como "todos".
-- ============================================================

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

revoke execute on function public.group_members_check() from public, anon, authenticated;
revoke execute on function public.training_sessions_check_audience() from public, anon, authenticated;
revoke execute on function public.session_applies_to(public.training_sessions, uuid) from public, anon;
grant execute on function public.session_applies_to(public.training_sessions, uuid) to authenticated;
grant execute on function public.athlete_get_schedule(uuid, date, date) to anon, authenticated;

notify pgrst, 'reload schema';
