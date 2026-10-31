-- ============================================================
-- MIGRAÇÃO: CRONOGRAMA DE TREINOS DA SEMANA
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Pode ser executado mais de uma vez e NÃO apaga dados existentes.
-- ⚠️ Depois de rodar este arquivo, rode também supabase_multiclube.sql
--    (ele refaz algumas funções daqui para separar os dados por clube).
-- Acesso: a comissão técnica edita; atletas logados só visualizam
--         (rode antes o supabase_login_atleta.sql).
-- Janela: só é possível programar a semana atual e a próxima; a semana
--         anterior fica guardada e o que for mais antigo é apagado.
-- ============================================================

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

notify pgrst, 'reload schema';
