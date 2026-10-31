-- ============================================================
-- MIGRAÇÃO: PAINEL DOS DONOS DA PLATAFORMA (ETAPA 3)
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_multiclube.sql e supabase_equipe.sql.
-- Pode ser executado mais de uma vez e NÃO apaga dados.
--
-- O que faz:
--  * Convite de clube novo (preso ao e-mail do responsável, 7 dias, uso único).
--    O responsável cria o clube (nome + escudo) e a conta dele, e vira admin.
--  * Donos: lista de clubes, suspender/reativar.
--  * Modo suporte: o dono entra num clube SOMENTE PARA LEITURA, por até 2 horas.
--    Toda entrada/saída fica registrada (LGPD).
--  * Escudos dos clubes no Supabase Storage (bucket "escudos", público).
-- ============================================================

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

notify pgrst, 'reload schema';
