-- ============================================================
-- MIGRAÇÃO: LEMBRETES POR NOTIFICAÇÃO (PUSH) PARA ATLETAS
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_grupos.sql (é o último da lista).
-- Pode ser executado mais de uma vez e NÃO apaga dados.
--
-- Regras (horário de Brasília, só entre 06h e 22h):
--  * PSE: 20 min após o fim de cada treino (sem fim: início + 1h30), para quem
--    é público do treino e ainda não respondeu; repete a cada 30 min.
--  * PSR: 20 min antes do primeiro treino do dia do atleta; repete a cada 30 min.
--  * Peso: nos dias/horário definidos pelo clube; repete a cada 30 min.
--  * Só recebe quem ativou os lembretes no aparelho e já criou a própria senha.
--
-- Depois deste arquivo: publicar a função "enviar-lembretes" e criar o
-- agendamento (passo a passo no fim do arquivo).
-- ============================================================

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
  updated_at timestamp with time zone default now() not null,
  constraint club_reminder_settings_days check (weight_days <@ array[1, 2, 3, 4, 5, 6, 7])
);

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

-- Ao sair do app, o aparelho para de receber lembretes daquele atleta
create or replace function public.athlete_logout(p_token uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  select s.athlete_id into v_athlete from public.athlete_sessions s where s.token = p_token;
  delete from public.athlete_sessions where token = p_token;
  if v_athlete is not null and not exists (select 1 from public.athlete_sessions where athlete_id = v_athlete) then
    delete from public.push_subscriptions where athlete_id = v_athlete;
  end if;
end;
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
  v_repeat interval := interval '29 minutes';  -- 30 min com folga para o agendamento de 5 em 5
begin
  if v_time < time '06:00' or v_time >= time '22:00' then
    return;
  end if;

  return query
  with elegiveis as (
    -- atleta ativo, de clube ativo, com senha própria e com aparelho cadastrado
    select a.id, a.club_id
    from public.athletes a
    join public.clubs k on k.id = a.club_id and k.status = 'ativo'
    where a.active
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
    from (select t.athlete_id, min(t.start_time) as first_start from treinos t group by t.athlete_id) f
    where v_time >= f.first_start - interval '20 minutes'
      and not exists (select 1 from public.psr_records r where r.athlete_id = f.athlete_id and r.date = v_today)
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
      and l.last_sent_at > p_now - v_repeat
  );
end;
$$;

-- Registra que o lembrete foi enviado (controla a repetição de 30 em 30 min)
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

notify pgrst, 'reload schema';

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
