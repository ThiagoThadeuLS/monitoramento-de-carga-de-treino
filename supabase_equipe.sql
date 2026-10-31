-- ============================================================
-- MIGRAÇÃO: EQUIPE DO CLUBE (ETAPA 2)
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_multiclube.sql. Pode ser executado mais de uma vez.
-- ⚠️ Se rodar este arquivo de novo, rode depois supabase_plataforma.sql
--    (ele redefine funções e regras daqui para o modo suporte e clubes novos).
--
-- Também no painel do Supabase (Authentication -> Sign In / Providers):
--   * "Allow new users to sign up": LIGADO (quem barra cadastros é este arquivo)
--   * "Confirm email": DESLIGADO (o treinador entra direto com a senha temporária)
--
-- O que faz:
--  * Convites internos de uso único: o admin do clube cadastra um treinador e o
--    navegador dele cria a conta com uma senha temporária + o código do convite.
--  * TODA conta nova no Supabase Auth precisa de convite válido para o e-mail
--    (exceção: e-mails dos donos da plataforma). Cadastro aberto é recusado.
--  * Admin do clube: promover/rebaixar e ativar/desativar treinadores do clube.
--  * Treinador novo é obrigado a trocar a senha temporária no primeiro acesso.
-- ============================================================

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

notify pgrst, 'reload schema';
