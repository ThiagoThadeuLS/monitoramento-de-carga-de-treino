  -- ============================================================
  -- MONITORAMENTO DE CARGA DE TREINO — BANCO COMPLETO (SUPABASE)
  -- Como aplicar: Supabase -> SQL Editor -> New query -> cole ESTE ARQUIVO INTEIRO -> Run.
  --
  -- * Serve para banco novo E para atualizar o banco atual.
  -- * Pode ser executado quantas vezes quiser: NÃO apaga dados (nenhuma limpeza
  --   automática; o cronograma guarda todos os treinos).
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
  --   9. Carga interna (duração da PSE), termo LGPD e histórico do atleta
  --  10. Adversários: sexo, autor da ficha, observações táticas e "apagar para mim"
  --  11. Competições e acompanhamento seguro de peso
  --  12. Preparação física (catálogo, fichas, PRs, treinos concluídos), uma PSR/peso
  --      por dia e grupos salvos de uma vez
  --  13. Desempenho: índices e a tela "Hoje" do atleta numa consulta só
  --  14. Situação das notificações de cada atleta (para o treinador)
  --  15. Segurança e integridade: regras antigas que sobraram, regras de valor e limite
  --      de tentativas no login do atleta
  --
  -- Datas das respostas dos atletas: sempre o dia de hoje no horário de Brasília
  -- (o banco decide; o app usa o mesmo fuso). O cronograma guarda todos os treinos.
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
    photo_url text,
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

  -- Colunas acrescentadas depois (carga interna e termo LGPD)
  alter table public.pse_records add column if not exists duration_minutes integer;
  alter table public.athletes add column if not exists terms_accepted_at timestamp with time zone;
  alter table public.athletes add column if not exists terms_version text;
  alter table public.athletes add column if not exists photo_url text;
  do $$
  begin
    if not exists (select 1 from pg_constraint where conname = 'pse_duracao_valida') then
      alter table public.pse_records add constraint pse_duracao_valida check (duration_minutes is null or duration_minutes between 1 and 600);
    end if;
  end $$;


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
        'categoria', p_athlete.categoria,
        'photo_url', p_athlete.photo_url
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

    if v_athlete.terms_accepted_at is null then
      raise exception 'termo_pendente';
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

  -- Envio de PSE pelo atleta logado (duração em minutos: se vier vazia, usa a do treino programado).
  -- A data é sempre o dia de hoje no horário de Brasília (p_date é ignorado: o atleta
  -- não escolhe o dia). Pode haver mais de uma PSE por dia (mais de um treino).
  drop function if exists public.athlete_submit_pse(uuid, date, text, integer, boolean, text);
  create or replace function public.athlete_submit_pse(
    p_token uuid,
    p_date date,
    p_training_type text,
    p_rpe_score integer,
    p_did_not_train boolean,
    p_observations text,
    p_duration_minutes integer default null
  )
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  begin
    insert into public.pse_records (athlete_id, date, training_type, rpe_score, did_not_train, observations, duration_minutes)
    values (
      public._athlete_ready(p_token),
      public.training_today(),
      p_training_type,
      p_rpe_score,
      coalesce(p_did_not_train, false),
      p_observations,
      case when coalesce(p_did_not_train, false) then null else p_duration_minutes end
    );
  end;
  $$;

  -- Envio de PSR pelo atleta logado: uma por dia (hoje, horário de Brasília; p_date é ignorado).
  -- Para corrigir, o atleta apaga a resposta de hoje no Histórico e envia de novo.
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
  declare
    v_athlete uuid := public._athlete_ready(p_token);
    v_today date := public.training_today();
  begin
    if exists (select 1 from public.psr_records r where r.athlete_id = v_athlete and r.date = v_today) then
      raise exception 'psr_ja_enviado';
    end if;
    insert into public.psr_records (
      athlete_id, date, psr_score, fatigue_score, sleep_score,
      muscle_soreness_score, stress_score, mood_score
    )
    values (
      v_athlete,
      v_today,
      p_psr_score, p_fatigue_score, p_sleep_score,
      p_muscle_soreness_score, p_stress_score, p_mood_score
    );
  exception when unique_violation then
    raise exception 'psr_ja_enviado';
  end;
  $$;

  -- Envio de peso pelo atleta logado: um por dia (hoje, horário de Brasília; p_date é ignorado).
  create or replace function public.athlete_submit_weight(p_token uuid, p_date date, p_weight numeric)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete uuid := public._athlete_ready(p_token);
    v_today date := public.training_today();
  begin
    if exists (select 1 from public.weight_records w where w.athlete_id = v_athlete and w.date = v_today) then
      raise exception 'peso_ja_enviado';
    end if;
    insert into public.weight_records (athlete_id, date, weight)
    values (v_athlete, v_today, p_weight);
  exception when unique_violation then
    raise exception 'peso_ja_enviado';
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
  grant execute on function public.athlete_submit_pse(uuid, date, text, integer, boolean, text, integer) to anon, authenticated;
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

  -- "Esconder anotações": o treinador vê as anotações; os atletas não recebem o texto
  alter table public.training_sessions add column if not exists hide_notes boolean not null default false;

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
  --   mais antigo que a semana anterior: fica guardado, só para consulta
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

  -- Limpeza do cronograma DESLIGADA: nenhum treino é apagado (histórico completo para a
  -- análise de períodos e as fichas de preparação física).

  -- Remove o agendamento antigo de limpeza do cronograma (se existir)
  do $$
  begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.unschedule(jobid) from cron.job where jobname = 'limpar-cronograma-antigo';
    end if;
  exception when others then
    raise notice 'pg_cron: %', sqlerrm;
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
      select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse,
             case when s.hide_notes then null else s.notes end
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
    photo_url text,
    role text not null default 'treinador' check (role in ('admin', 'treinador')),
    active boolean not null default true,
    must_change_password boolean not null default false,
    created_at timestamp with time zone default now() not null
  );

  create index if not exists coaches_club_idx on public.coaches (club_id);
  alter table public.coaches add column if not exists photo_url text;

  -- Clube inicial (id fixo) e contas que já existem viram admin dele.
  -- Só na PRIMEIRA vez que esta parte roda (as tabelas de dados ainda não têm club_id):
  -- num banco já migrado, ou zerado para produção, não recria o clube nem cria treinadores.
  do $$
  begin
    if not exists (
      select 1 from pg_attribute
      where attrelid = to_regclass('public.athletes') and attname = 'club_id' and not attisdropped
    ) then
      insert into public.clubs (id, nome, escudo_url)
      values ('00000000-0000-4000-8000-000000000001', 'Minas Tênis Clube', '/minas-tenis-clube.svg')
      on conflict (id) do nothing;

      insert into public.coaches (user_id, club_id, nome, email, role)
      select u.id,
            '00000000-0000-4000-8000-000000000001',
            coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
            lower(u.email),
            'admin'
      from auth.users u
      where not exists (select 1 from public.coaches c where c.user_id = u.id)
        and not exists (select 1 from public.coaches);
    end if;
  end $$;

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
          'photo_url', c.photo_url,
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
      -- Respostas e cronograma usam o índice de clube + data (parte 13)
      if t in ('athletes', 'adversarios') then
        execute format('create index if not exists %I on public.%I (club_id)', t || '_club_idx', t);
      end if;
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
          using (club_id = (select public.current_club_id()))
          with check (club_id = (select public.current_club_id()))',
        'Clube: acesso da comissão técnica', t);
    end loop;
  end $$;

  alter table public.clubs enable row level security;
  alter table public.platform_owners enable row level security;
  alter table public.coaches enable row level security;
  revoke all on public.clubs, public.platform_owners, public.coaches from anon;

  drop policy if exists "Clube: treinador vê o próprio clube" on public.clubs;
  create policy "Clube: treinador vê o próprio clube" on public.clubs
    for select to authenticated using (id = (select public.current_club_id()));

  drop policy if exists "Equipe: treinador vê colegas do clube" on public.coaches;
  create policy "Equipe: treinador vê colegas do clube" on public.coaches
    for select to authenticated using (club_id = (select public.current_club_id()));
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
  -- (A versão final, com termo e tutorial, está na parte 13.)
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
        'categoria', p_athlete.categoria,
        'photo_url', p_athlete.photo_url
      ),
      'club', (
        select json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url)
        from public.clubs k where k.id = p_athlete.club_id
      )
    );
  $$;

  -- (A versão final, com limite de tentativas, está na parte 15.)
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
      select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse,
             case when s.hide_notes then null else s.notes end
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
      execute format('create policy %I on public.%I for select to authenticated using (club_id = (select public.current_club_id()))', 'Clube: leitura', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: inclusão', t);
      execute format('create policy %I on public.%I for update to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null) with check (club_id = (select public.current_club_id()))', 'Clube: alteração', t);
      execute format('create policy %I on public.%I for delete to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: exclusão', t);
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

  -- Foto do treinador (o envio das fotos está em implementação)
  alter table public.coaches add column if not exists photo_url text;

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
          'photo_url', c.photo_url,
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
  -- SVG fica de fora: um SVG pode carregar script e o bucket é público
  values ('escudos', 'escudos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
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
    with check (bucket_id = 'escudos' and (storage.foldername(name))[1] = (select public.current_club_id())::text and (select public.is_club_admin()));

  drop policy if exists "Escudos: admin do clube substitui" on storage.objects;
  create policy "Escudos: admin do clube substitui" on storage.objects
    for update to authenticated
    using (bucket_id = 'escudos' and (storage.foldername(name))[1] = (select public.current_club_id())::text and (select public.is_club_admin()));

  drop policy if exists "Escudos: admin do clube apaga" on storage.objects;
  create policy "Escudos: admin do clube apaga" on storage.objects
    for delete to authenticated
    using (bucket_id = 'escudos' and (storage.foldername(name))[1] = (select public.current_club_id())::text and (select public.is_club_admin()));

  -- Admin grava o endereço do escudo. Só vale um endereço público do Storage do Supabase
  -- apontando para um arquivo (PNG/JPG/WEBP) que já existe na pasta do próprio clube.
  create or replace function public.club_set_escudo(p_url text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_club uuid := public.current_club_id();
    v_prefix text := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/escudos/';
    v_file text;
  begin
    if not public.is_club_admin() then raise exception 'nao_autorizado'; end if;
    if p_url is null or p_url !~ (v_prefix || v_club::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$') then
      raise exception 'escudo_invalido';
    end if;
    v_file := v_club::text || '/' || regexp_replace(p_url, '^.*/', '');
    if not exists (select 1 from storage.objects o where o.bucket_id = 'escudos' and o.name = v_file) then
      raise exception 'escudo_invalido';
    end if;
    update public.clubs set escudo_url = p_url where id = v_club;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 5b. Fotos de atletas e treinadores (Supabase Storage)
  -- As imagens são reduzidas no navegador antes de subir (512 px, JPEG/WEBP),
  -- então cada foto fica pequena e o bucket continua leve.
  -- ------------------------------------------------------------
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos', 'fotos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- A imagem abre pelo endereço público (bucket público: o app do atleta não usa o Supabase Auth).
  -- Listar, substituir e apagar pela API: só a pasta do próprio clube. Antes qualquer conta
  -- logada listava as fotos de todos os clubes (com os códigos de clube e de atleta).
  drop policy if exists "Fotos: leitura" on storage.objects;
  create policy "Fotos: leitura" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'fotos'
      and (storage.foldername(name))[1] = (select public.current_club_id())::text
    );

  -- Estrutura do caminho: <clube>/atletas/<atleta>/arquivo.jpg
  --                      <clube>/treinadores/<treinador>/arquivo.jpg
  -- Qualquer treinador ativo do clube troca foto de atleta. Foto de treinador:
  -- só a própria (ou o admin do clube). Modo suporte é somente leitura.
  drop policy if exists "Fotos: equipe do clube envia" on storage.objects;
  create policy "Fotos: equipe do clube envia" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'fotos'
      and (select public.support_club_id()) is null
      and (storage.foldername(name))[1] = (select public.current_club_id())::text
      and (
        (storage.foldername(name))[2] = 'atletas'
        or (
          (storage.foldername(name))[2] = 'treinadores'
          and (
            (storage.foldername(name))[3] = (select auth.uid())::text
            or (select public.is_club_admin())
          )
        )
      )
    );

  drop policy if exists "Fotos: equipe do clube substitui" on storage.objects;
  create policy "Fotos: equipe do clube substitui" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'fotos'
      and (select public.support_club_id()) is null
      and (storage.foldername(name))[1] = (select public.current_club_id())::text
      and (
        (storage.foldername(name))[2] = 'atletas'
        or (
          (storage.foldername(name))[2] = 'treinadores'
          and (
            (storage.foldername(name))[3] = (select auth.uid())::text
            or (select public.is_club_admin())
          )
        )
      )
    )
    with check (
      bucket_id = 'fotos'
      and (select public.support_club_id()) is null
      and (storage.foldername(name))[1] = (select public.current_club_id())::text
      and (
        (storage.foldername(name))[2] = 'atletas'
        or (
          (storage.foldername(name))[2] = 'treinadores'
          and (
            (storage.foldername(name))[3] = (select auth.uid())::text
            or (select public.is_club_admin())
          )
        )
      )
    );

  drop policy if exists "Fotos: equipe do clube apaga" on storage.objects;
  create policy "Fotos: equipe do clube apaga" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'fotos'
      and (select public.support_club_id()) is null
      and (storage.foldername(name))[1] = (select public.current_club_id())::text
      and (
        (storage.foldername(name))[2] = 'atletas'
        or (
          (storage.foldername(name))[2] = 'treinadores'
          and (
            (storage.foldername(name))[3] = (select auth.uid())::text
            or (select public.is_club_admin())
          )
        )
      )
    );

  -- Grava a foto do atleta depois do upload. Só aceita um endereço público do
  -- Storage apontando para um arquivo que já existe na pasta do próprio atleta.
  create or replace function public.club_set_athlete_photo(p_athlete_id uuid, p_url text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_club uuid;
    v_prefix text := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/fotos/';
    v_file text;
  begin
    if public.support_club_id() is not null then raise exception 'nao_autorizado'; end if;
    v_club := public.current_club_id();
    if v_club is null then raise exception 'nao_autorizado'; end if;
    if not exists (select 1 from public.athletes a where a.id = p_athlete_id and a.club_id = v_club) then
      raise exception 'nao_autorizado';
    end if;

    if p_url is null then
      update public.athletes set photo_url = null where id = p_athlete_id;
      return;
    end if;

    if p_url !~ (v_prefix || v_club::text || '/atletas/' || p_athlete_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$') then
      raise exception 'foto_invalida';
    end if;
    v_file := regexp_replace(p_url, '^.*/fotos/', '');
    if not exists (select 1 from storage.objects o where o.bucket_id = 'fotos' and o.name = v_file) then
      raise exception 'foto_invalida';
    end if;

    update public.athletes set photo_url = p_url where id = p_athlete_id;
  end;
  $$;

  -- Foto do treinador: cada um troca a própria; o admin do clube troca de qualquer um.
  create or replace function public.club_set_coach_photo(p_user_id uuid, p_url text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_club uuid;
    v_prefix text := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/fotos/';
    v_file text;
  begin
    if public.support_club_id() is not null then raise exception 'nao_autorizado'; end if;
    v_club := public.current_club_id();
    if v_club is null then raise exception 'nao_autorizado'; end if;
    if not exists (select 1 from public.coaches c where c.user_id = p_user_id and c.club_id = v_club) then
      raise exception 'nao_autorizado';
    end if;
    if p_user_id <> auth.uid() and not public.is_club_admin() then raise exception 'nao_autorizado'; end if;

    if p_url is null then
      update public.coaches set photo_url = null where user_id = p_user_id;
      return;
    end if;

    if p_url !~ (v_prefix || v_club::text || '/treinadores/' || p_user_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$') then
      raise exception 'foto_invalida';
    end if;
    v_file := regexp_replace(p_url, '^.*/fotos/', '');
    if not exists (select 1 from storage.objects o where o.bucket_id = 'fotos' and o.name = v_file) then
      raise exception 'foto_invalida';
    end if;

    update public.coaches set photo_url = p_url where user_id = p_user_id;
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
  revoke execute on function public.club_set_athlete_photo(uuid, text) from public, anon;
  revoke execute on function public.club_set_coach_photo(uuid, text) from public, anon;
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
  grant execute on function public.club_set_athlete_photo(uuid, text) to authenticated;
  grant execute on function public.club_set_coach_photo(uuid, text) to authenticated;
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
    if new.audience in ('todos', 'ninguem') then
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
      select s.id, s.date, s.start_time, s.end_time, s.name, s.training_type, s.expected_pse,
             case when s.hide_notes then null else s.notes end
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
      execute format('create policy %I on public.%I for select to authenticated using (club_id = (select public.current_club_id()))', 'Clube: leitura', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: inclusão', t);
      execute format('create policy %I on public.%I for update to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null) with check (club_id = (select public.current_club_id()))', 'Clube: alteração', t);
      execute format('create policy %I on public.%I for delete to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: exclusão', t);
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

  -- Aparelho que parou de aceitar (expirou ou falhou várias vezes): fica marcado, não é apagado.
  -- O app do atleta é avisado e pede para ativar de novo (gera uma assinatura nova).
  alter table public.push_subscriptions add column if not exists expired_at timestamp with time zone;
  alter table public.push_subscriptions add column if not exists failures integer not null default 0;
  alter table public.push_subscriptions add column if not exists last_error text;
  alter table public.push_subscriptions add column if not exists last_error_at timestamp with time zone;

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
    for select to authenticated using (club_id = (select public.current_club_id()));
  create policy "Clube: inclusão" on public.club_reminder_settings
    for insert to authenticated with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);
  create policy "Clube: alteração" on public.club_reminder_settings
    for update to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)
    with check (club_id = (select public.current_club_id()));

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
    -- Assinatura que o serviço de notificações já recusou: o app precisa criar outra
    if exists (select 1 from public.push_subscriptions s where s.endpoint = p_endpoint and s.expired_at is not null) then
      raise exception 'push_expirado';
    end if;
    -- o mesmo aparelho passa a ser do atleta logado nele
    insert into public.push_subscriptions (athlete_id, endpoint, p256dh, auth, user_agent)
    values (v_athlete, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    on conflict (endpoint) do update
      set athlete_id = excluded.athlete_id, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, created_at = now();
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
        and exists (select 1 from public.push_subscriptions ps where ps.athlete_id = a.id and ps.expired_at is null)
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
            -- "Não treinei" sem treino vale para o dia todo; com treino, só para aquele tipo
            and ((p.did_not_train and (p.training_type is null or p.training_type = t.training_type))
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
  grant execute on function public.athlete_save_push(uuid, text, text, text, text) to anon, authenticated;
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
  --
  -- PROTEÇÃO OPCIONAL (só o agendamento consegue chamar a função). Nesta ordem:
  --   1. Guarde um texto aleatório no Vault:
  --        select vault.create_secret('<texto-aleatório-longo>', 'cron_lembretes');
  --   2. Troque o agendamento para mandar esse texto no cabeçalho:
  --        select cron.unschedule('enviar-lembretes');
  --        select cron.schedule('enviar-lembretes', '*/5 * * * *', $job$ select net.http_post(
  --          url := 'https://bdlwizqxbfocqsekdkkl.supabase.co/functions/v1/enviar-lembretes',
  --          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
  --            (select decrypted_secret from vault.decrypted_secrets where name = 'cron_lembretes')),
  --          body := '{}'::jsonb
  --        ) $job$);
  --   3. Em Edge Functions -> Secrets, crie CRON_SECRET com o MESMO texto.
  --   Sem o passo 3 a função continua aceitando qualquer chamada (como antes).
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

  -- ############################################################
  -- PARTE 9. CARGA INTERNA, TERMO LGPD E HISTÓRICO DO ATLETA
  -- ############################################################

  -- 9.1 Duração do treino programado que corresponde a uma PSE (mesmo dia, tipo e público)
  create or replace function public._session_duration_for(p_athlete uuid, p_date date, p_type text, p_at timestamp with time zone)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select greatest(1, round(extract(epoch from (coalesce(s.end_time, s.start_time + interval '90 minutes') - s.start_time)) / 60))::integer
    from public.training_sessions s
    join public.athletes a on a.id = p_athlete and a.club_id = s.club_id
    where s.date = p_date
      and s.training_type = p_type
      and public.session_applies_to(s, p_athlete)
    -- o treino que já tinha começado quando a PSE foi enviada; senão, o primeiro do dia
    order by (s.start_time <= (coalesce(p_at, now()) at time zone 'America/Sao_Paulo')::time) desc,
            case when s.start_time <= (coalesce(p_at, now()) at time zone 'America/Sao_Paulo')::time then s.start_time end desc nulls last,
            s.start_time
    limit 1;
  $$;
  revoke execute on function public._session_duration_for(uuid, date, text, timestamp with time zone) from public, anon, authenticated;

  -- PSE sem duração recebe a do treino programado (carga = PSE x minutos)
  create or replace function public.pse_fill_duration()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if new.did_not_train then
      new.duration_minutes := null;
    elsif new.duration_minutes is null then
      new.duration_minutes := public._session_duration_for(new.athlete_id, new.date, new.training_type, coalesce(new.created_at, now()));
    end if;
    return new;
  end;
  $$;

  drop trigger if exists pse_records_fill_duration on public.pse_records;
  create trigger pse_records_fill_duration before insert on public.pse_records
    for each row execute function public.pse_fill_duration();

  -- Respostas antigas: preenche com o cronograma que ainda existe
  update public.pse_records p
    set duration_minutes = public._session_duration_for(p.athlete_id, p.date, p.training_type, p.created_at)
  where p.duration_minutes is null
    and not p.did_not_train
    and public._session_duration_for(p.athlete_id, p.date, p.training_type, p.created_at) is not null;

  -- 9.2 Termo de consentimento (LGPD)
  create or replace function public.athlete_terms_status(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete public.athletes := public._athlete_from_token(p_token);
  begin
    return json_build_object('accepted_at', v_athlete.terms_accepted_at, 'version', v_athlete.terms_version);
  end;
  $$;

  create or replace function public.athlete_accept_terms(p_token uuid, p_version text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete public.athletes := public._athlete_from_token(p_token);
  begin
    if coalesce(trim(p_version), '') = '' then
      raise exception 'versao_invalida';
    end if;
    update public.athletes
      set terms_accepted_at = now(), terms_version = left(trim(p_version), 20)
    where id = v_athlete.id;
  end;
  $$;

  -- 9.3 Histórico do próprio atleta e correção de respostas do dia
  create or replace function public.athlete_get_history(p_token uuid, p_from date, p_to date)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_id uuid := public._athlete_ready(p_token);
    v_from date := greatest(p_from, p_to - 180);
  begin
    if p_from is null or p_to is null or p_from > p_to then
      raise exception 'periodo_invalido';
    end if;
    return json_build_object(
      'pse', coalesce((select json_agg(row_to_json(x) order by x.date, x.created_at) from (
        select id, date, training_type, rpe_score, did_not_train, observations, duration_minutes, created_at
        from public.pse_records where athlete_id = v_id and date between v_from and p_to) x), '[]'::json),
      'psr', coalesce((select json_agg(row_to_json(x) order by x.date, x.created_at) from (
        select id, date, psr_score, fatigue_score, sleep_score, muscle_soreness_score, stress_score, mood_score, created_at
        from public.psr_records where athlete_id = v_id and date between v_from and p_to) x), '[]'::json),
      'weight', coalesce((select json_agg(row_to_json(x) order by x.date, x.created_at) from (
        select id, date, weight, created_at
        from public.weight_records where athlete_id = v_id and date between v_from and p_to) x), '[]'::json)
    );
  end;
  $$;

  -- Apaga uma resposta do próprio atleta, só no mesmo dia (para corrigir e enviar de novo)
  create or replace function public.athlete_delete_record(p_token uuid, p_kind text, p_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_id uuid := public._athlete_ready(p_token);
    v_date date;
  begin
    if p_kind = 'pse' then
      select date into v_date from public.pse_records where id = p_id and athlete_id = v_id;
    elsif p_kind = 'psr' then
      select date into v_date from public.psr_records where id = p_id and athlete_id = v_id;
    elsif p_kind = 'peso' then
      select date into v_date from public.weight_records where id = p_id and athlete_id = v_id;
    else
      raise exception 'tipo_invalido';
    end if;

    if v_date is null then
      raise exception 'registro_nao_encontrado';
    end if;
    if v_date <> public.training_today() then
      raise exception 'fora_do_prazo';
    end if;

    if p_kind = 'pse' then
      delete from public.pse_records where id = p_id and athlete_id = v_id;
    elsif p_kind = 'psr' then
      delete from public.psr_records where id = p_id and athlete_id = v_id;
    else
      delete from public.weight_records where id = p_id and athlete_id = v_id;
    end if;
  end;
  $$;

  revoke execute on function public.athlete_terms_status(uuid) from public;
  revoke execute on function public.athlete_accept_terms(uuid, text) from public;
  revoke execute on function public.athlete_get_history(uuid, date, date) from public;
  revoke execute on function public.athlete_delete_record(uuid, text, uuid) from public;
  grant execute on function public.athlete_terms_status(uuid) to anon, authenticated;
  grant execute on function public.athlete_accept_terms(uuid, text) to anon, authenticated;
  grant execute on function public.athlete_get_history(uuid, date, date) to anon, authenticated;
  grant execute on function public.athlete_delete_record(uuid, text, uuid) to anon, authenticated;

  notify pgrst, 'reload schema';


  -- ############################################################
  -- PARTE 10. ADVERSÁRIOS: SEXO, AUTOR DA FICHA E OBSERVAÇÕES
  -- Treinador usa as tabelas direto (regras por clube). Atleta não tem login do
  -- Supabase: usa as funções athlete_* abaixo, com o token da sessão dele.
  -- Atleta vê as fichas da comissão técnica e as próprias; vê as observações da
  -- comissão técnica e as próprias; só altera e apaga o que ele mesmo cadastrou.
  -- ############################################################
  alter table public.adversarios add column if not exists sexo text;
  alter table public.adversarios add column if not exists criado_por_id uuid;
  alter table public.adversarios add column if not exists criado_por_tipo text;
  alter table public.adversarios alter column criado_por_tipo set default 'tecnico';
  -- fichas de antes do campo "autor" são da comissão técnica
  update public.adversarios set criado_por_tipo = 'tecnico' where criado_por_tipo is null;

  -- Correção: ficha gravada no clube errado volta para o clube de quem cadastrou
  -- (a versão anterior da tela podia usar o clube de outra ficha da lista).
  -- Se o clube certo já tem ficha com o mesmo nome, deixa como está.
  update public.adversarios a
    set club_id = t.club_id
  from public.athletes t
  where a.criado_por_tipo = 'atleta' and t.id::text = a.criado_por_id::text and a.club_id <> t.club_id
    and not exists (select 1 from public.adversarios b where b.club_id = t.club_id and lower(b.nome) = lower(a.nome));
  update public.adversarios a
    set club_id = c.club_id
  from public.coaches c
  where a.criado_por_tipo = 'tecnico' and c.user_id::text = a.criado_por_id::text and a.club_id <> c.club_id
    and not exists (select 1 from public.adversarios b where b.club_id = c.club_id and lower(b.nome) = lower(a.nome));

  do $$
  begin
    if not exists (select 1 from pg_constraint where conname = 'adversarios_sexo_valido') then
      alter table public.adversarios
        add constraint adversarios_sexo_valido check (sexo is null or sexo in ('masculino', 'feminino')) not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'adversarios_autor_valido') then
      alter table public.adversarios
        add constraint adversarios_autor_valido check (criado_por_tipo in ('atleta', 'tecnico')) not valid;
    end if;
  end $$;

  -- Treinador cadastra ficha sempre em nome próprio, como comissão técnica
  drop policy if exists "Adversários: autor da ficha" on public.adversarios;
  create policy "Adversários: autor da ficha" on public.adversarios
    as restrictive for insert to authenticated
    with check (coalesce(criado_por_tipo, 'tecnico') = 'tecnico' and (criado_por_id is null or criado_por_id::text = (select auth.uid())::text));

  -- ------------------------------------------------------------
  -- 1. Observações táticas
  -- ------------------------------------------------------------
  create table if not exists public.adversario_observacoes (
    id uuid primary key default gen_random_uuid(),
    adversario_id uuid not null references public.adversarios(id) on delete cascade,
    autor_id uuid not null,
    autor_tipo text not null check (autor_tipo in ('atleta', 'tecnico')),
    texto text not null check (length(trim(texto)) between 1 and 2000),
    created_at timestamp with time zone default now() not null
  );

  -- Se a tabela foi criada antes pelo painel: completa as colunas
  alter table public.adversario_observacoes add column if not exists autor_id uuid;
  alter table public.adversario_observacoes add column if not exists autor_tipo text;
  alter table public.adversario_observacoes add column if not exists texto text;
  alter table public.adversario_observacoes add column if not exists created_at timestamp with time zone default now();
  -- Quando o autor corrigiu o texto (null = nunca editado)
  alter table public.adversario_observacoes add column if not exists editado_em timestamp with time zone;
  create index if not exists adversario_observacoes_adversario_idx on public.adversario_observacoes (adversario_id);

  -- Apagar a ficha apaga as observações dela
  do $$
  declare
    c record;
  begin
    if (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
        where a.attrelid = 'public.adversario_observacoes'::regclass and a.attname = 'adversario_id' and not a.attisdropped) = 'uuid' then
      for c in
        select conname from pg_constraint
        where conrelid = 'public.adversario_observacoes'::regclass and contype = 'f'
          and confrelid = 'public.adversarios'::regclass and confdeltype <> 'c'
      loop
        execute format('alter table public.adversario_observacoes drop constraint %I', c.conname);
      end loop;
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.adversario_observacoes'::regclass and contype = 'f' and confrelid = 'public.adversarios'::regclass
      ) then
        alter table public.adversario_observacoes
          add constraint adversario_observacoes_adversario_fk
          foreign key (adversario_id) references public.adversarios(id) on delete cascade not valid;
      end if;
    end if;
  end $$;

  -- Regras de acesso: só treinadores do clube (atleta usa as funções abaixo).
  -- Remove regras antigas criadas pelo painel (podiam liberar acesso anônimo).
  alter table public.adversario_observacoes enable row level security;
  revoke all on public.adversario_observacoes from anon;
  grant select, insert, update, delete on public.adversario_observacoes to authenticated;
  do $$
  declare
    p record;
  begin
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'adversario_observacoes' loop
      execute format('drop policy %I on public.adversario_observacoes', p.policyname);
    end loop;
  end $$;

  -- Autor é de outro clube? (observações escritas de fora, por falha antiga, não aparecem)
  create or replace function public._autor_de_outro_clube(p_tipo text, p_autor text, p_club uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select case
      when p_tipo = 'tecnico' then exists (select 1 from public.coaches c where c.user_id::text = p_autor and c.club_id <> p_club)
      when p_tipo = 'atleta' then exists (select 1 from public.athletes t where t.id::text = p_autor and t.club_id <> p_club)
      else false
    end;
  $$;
  revoke execute on function public._autor_de_outro_clube(text, text, uuid) from public, anon;
  grant execute on function public._autor_de_outro_clube(text, text, uuid) to authenticated;

  create policy "Observações: leitura do clube" on public.adversario_observacoes
    for select to authenticated
    using (
      exists (select 1 from public.adversarios a where a.id = adversario_id and a.club_id = (select public.current_club_id()))
      and not public._autor_de_outro_clube(autor_tipo, autor_id::text, (select public.current_club_id()))
    );

  create policy "Observações: treinador escreve" on public.adversario_observacoes
    for insert to authenticated
    with check (
      autor_tipo = 'tecnico' and autor_id::text = (select auth.uid())::text and (select public.support_club_id()) is null
      and exists (select 1 from public.adversarios a where a.id = adversario_id and a.club_id = (select public.current_club_id()))
    );

  create policy "Observações: autor apaga" on public.adversario_observacoes
    for delete to authenticated
    using (
      autor_tipo = 'tecnico' and autor_id::text = (select auth.uid())::text and (select public.support_club_id()) is null
      and exists (select 1 from public.adversarios a where a.id = adversario_id and a.club_id = (select public.current_club_id()))
    );

  -- O treinador corrige o texto da própria observação (mesma regra de quem apaga)
  create policy "Observações: autor edita" on public.adversario_observacoes
    for update to authenticated
    using (
      autor_tipo = 'tecnico' and autor_id::text = (select auth.uid())::text and (select public.support_club_id()) is null
      and exists (select 1 from public.adversarios a where a.id = adversario_id and a.club_id = (select public.current_club_id()))
    )
    with check (
      autor_tipo = 'tecnico' and autor_id::text = (select auth.uid())::text
      and exists (select 1 from public.adversarios a where a.id = adversario_id and a.club_id = (select public.current_club_id()))
    );

  -- ------------------------------------------------------------
  -- 2. "Apagar para mim": a ficha some só da lista de quem apagou
  --    (os outros continuam vendo; dá para mostrar de novo)
  -- ------------------------------------------------------------
  create table if not exists public.adversario_ocultos (
    id uuid primary key default gen_random_uuid(),
    adversario_id uuid not null references public.adversarios(id) on delete cascade,
    athlete_id uuid references public.athletes(id) on delete cascade,
    coach_id uuid references auth.users(id) on delete cascade,
    created_at timestamp with time zone default now() not null,
    constraint adversario_ocultos_um_dono check ((athlete_id is null) <> (coach_id is null))
  );
  create unique index if not exists adversario_ocultos_atleta_unico
    on public.adversario_ocultos (adversario_id, athlete_id) where athlete_id is not null;
  create unique index if not exists adversario_ocultos_treinador_unico
    on public.adversario_ocultos (adversario_id, coach_id) where coach_id is not null;

  -- Treinador lê só o que ele apagou; gravar é pelas funções
  alter table public.adversario_ocultos enable row level security;
  revoke all on public.adversario_ocultos from anon, authenticated;
  grant select on public.adversario_ocultos to authenticated;
  drop policy if exists "Ocultos: treinador vê os próprios" on public.adversario_ocultos;
  create policy "Ocultos: treinador vê os próprios" on public.adversario_ocultos
    for select to authenticated
    using (coach_id = (select auth.uid()));

  create or replace function public.coach_set_adversario_oculto(p_id uuid, p_oculto boolean)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  begin
    if auth.uid() is null or public.support_club_id() is not null
       or not exists (select 1 from public.adversarios a where a.id = p_id and a.club_id = public.current_club_id()) then
      raise exception 'nao_autorizado';
    end if;
    if p_oculto then
      insert into public.adversario_ocultos (adversario_id, coach_id) values (p_id, auth.uid())
      on conflict (adversario_id, coach_id) where coach_id is not null do nothing;
    else
      delete from public.adversario_ocultos where adversario_id = p_id and coach_id = auth.uid();
    end if;
  end;
  $$;

  revoke execute on function public.coach_set_adversario_oculto(uuid, boolean) from public, anon;
  grant execute on function public.coach_set_adversario_oculto(uuid, boolean) to authenticated;

  -- ------------------------------------------------------------
  -- 3. Funções do atleta
  -- ------------------------------------------------------------

  -- Ficha que o atleta pode ver: do clube dele, da comissão técnica ou dele mesmo
  create or replace function public._athlete_sees_adversario(p_athlete uuid, p_adversario uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select exists (
      select 1
      from public.adversarios a
      join public.athletes t on t.id = p_athlete and t.club_id = a.club_id
      where a.id = p_adversario
        and (coalesce(a.criado_por_tipo, 'tecnico') = 'tecnico' or a.criado_por_id::text = p_athlete::text)
    );
  $$;

  create or replace function public.athlete_list_adversarios(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    return json_build_object(
      'me', v_me,
      'adversarios', coalesce((
        select json_agg(x order by lower(x.nome))
        from (
          select a.id, a.club_id, a.nome, a.sexo, a.categoria_peso, a.classe_idade, a.tipo_origem, a.origem_valor,
                 a.criado_por_id, coalesce(a.criado_por_tipo, 'tecnico') as criado_por_tipo,
                 exists (select 1 from public.adversario_ocultos h where h.adversario_id = a.id and h.athlete_id = v_me) as oculto
          from public.adversarios a
          where public._athlete_sees_adversario(v_me, a.id)
        ) x
      ), '[]'::json),
      'observacoes', coalesce((
        select json_agg(x order by x.created_at desc)
        from (
          select o.id, o.adversario_id, o.autor_id, o.autor_tipo, o.texto, o.created_at, o.editado_em
          from public.adversario_observacoes o
          join public.adversarios a on a.id = o.adversario_id
          where public._athlete_sees_adversario(v_me, o.adversario_id)
            and (o.autor_tipo = 'tecnico' or o.autor_id::text = v_me::text)
            and not public._autor_de_outro_clube(o.autor_tipo, o.autor_id::text, a.club_id)
        ) x
      ), '[]'::json)
    );
  end;
  $$;

  -- Cadastra (p_id nulo) ou edita uma ficha do próprio atleta
  create or replace function public.athlete_save_adversario(
    p_token uuid, p_id uuid, p_nome text, p_sexo text, p_categoria_peso text,
    p_classe_idade text, p_tipo_origem text, p_origem_valor text
  )
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_club uuid;
    v_id uuid;
  begin
    if length(trim(coalesce(p_nome, ''))) = 0 or length(trim(coalesce(p_categoria_peso, ''))) = 0
       or length(trim(coalesce(p_origem_valor, ''))) = 0 then
      raise exception 'adversario_incompleto';
    end if;
    if length(trim(p_nome)) > 120 or length(trim(p_origem_valor)) > 120 or length(trim(p_categoria_peso)) > 20
       or coalesce(p_sexo, '') not in ('masculino', 'feminino')
       or coalesce(p_classe_idade, '') not in ('juvenil', 'júnior', 'sênior')
       or coalesce(p_tipo_origem, '') not in ('pais', 'clube') then
      raise exception 'adversario_invalido';
    end if;

    select a.club_id into v_club from public.athletes a where a.id = v_me;

    if p_id is null then
      insert into public.adversarios (club_id, nome, sexo, categoria_peso, classe_idade, tipo_origem, origem_valor, criado_por_id, criado_por_tipo)
      values (v_club, trim(p_nome), p_sexo, trim(p_categoria_peso), p_classe_idade, p_tipo_origem, trim(p_origem_valor), v_me, 'atleta')
      returning id into v_id;
    else
      update public.adversarios
        set nome = trim(p_nome), sexo = p_sexo, categoria_peso = trim(p_categoria_peso),
            classe_idade = p_classe_idade, tipo_origem = p_tipo_origem, origem_valor = trim(p_origem_valor)
      where id = p_id and club_id = v_club and criado_por_tipo = 'atleta' and criado_por_id::text = v_me::text
      returning id into v_id;
      if v_id is null then
        raise exception 'nao_autorizado';
      end if;
    end if;
    return v_id;
  end;
  $$;

  create or replace function public.athlete_delete_adversario(p_token uuid, p_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    delete from public.adversarios a
    where a.id = p_id and a.criado_por_tipo = 'atleta' and a.criado_por_id::text = v_me::text
      and a.club_id = (select t.club_id from public.athletes t where t.id = v_me);
    if not found then
      raise exception 'nao_autorizado';
    end if;
  end;
  $$;

  create or replace function public.athlete_add_observacao(p_token uuid, p_adversario uuid, p_texto text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    if length(trim(coalesce(p_texto, ''))) = 0 then
      raise exception 'observacao_vazia';
    end if;
    if length(trim(p_texto)) > 2000 then
      raise exception 'observacao_longa';
    end if;
    if not public._athlete_sees_adversario(v_me, p_adversario) then
      raise exception 'registro_nao_encontrado';
    end if;
    insert into public.adversario_observacoes (adversario_id, autor_id, autor_tipo, texto)
    values (p_adversario, v_me, 'atleta', trim(p_texto));
  end;
  $$;

  create or replace function public.athlete_delete_observacao(p_token uuid, p_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    delete from public.adversario_observacoes o
    where o.id = p_id and o.autor_tipo = 'atleta' and o.autor_id::text = v_me::text;
    if not found then
      raise exception 'registro_nao_encontrado';
    end if;
  end;
  $$;

  -- O atleta corrige o texto da própria observação
  create or replace function public.athlete_update_observacao(p_token uuid, p_id uuid, p_texto text)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    if length(trim(coalesce(p_texto, ''))) = 0 then
      raise exception 'observacao_vazia';
    end if;
    if length(trim(p_texto)) > 2000 then
      raise exception 'observacao_longa';
    end if;
    update public.adversario_observacoes o
    set texto = trim(p_texto), editado_em = now()
    where o.id = p_id and o.autor_tipo = 'atleta' and o.autor_id::text = v_me::text;
    if not found then
      raise exception 'registro_nao_encontrado';
    end if;
  end;
  $$;

  -- "Apagar para mim" (p_oculto = true) ou mostrar de novo (false)
  create or replace function public.athlete_set_adversario_oculto(p_token uuid, p_id uuid, p_oculto boolean)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    if not public._athlete_sees_adversario(v_me, p_id) then
      raise exception 'registro_nao_encontrado';
    end if;
    if p_oculto then
      insert into public.adversario_ocultos (adversario_id, athlete_id) values (p_id, v_me)
      on conflict (adversario_id, athlete_id) where athlete_id is not null do nothing;
    else
      delete from public.adversario_ocultos where adversario_id = p_id and athlete_id = v_me;
    end if;
  end;
  $$;

  revoke execute on function public.athlete_set_adversario_oculto(uuid, uuid, boolean) from public;
  grant execute on function public.athlete_set_adversario_oculto(uuid, uuid, boolean) to anon, authenticated;

  revoke execute on function public._athlete_sees_adversario(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.athlete_list_adversarios(uuid) from public;
  revoke execute on function public.athlete_save_adversario(uuid, uuid, text, text, text, text, text, text) from public;
  revoke execute on function public.athlete_delete_adversario(uuid, uuid) from public;
  revoke execute on function public.athlete_add_observacao(uuid, uuid, text) from public;
  revoke execute on function public.athlete_delete_observacao(uuid, uuid) from public;
  revoke execute on function public.athlete_update_observacao(uuid, uuid, text) from public;
  grant execute on function public.athlete_update_observacao(uuid, uuid, text) to anon, authenticated;
  grant execute on function public.athlete_list_adversarios(uuid) to anon, authenticated;
  grant execute on function public.athlete_save_adversario(uuid, uuid, text, text, text, text, text, text) to anon, authenticated;
  grant execute on function public.athlete_delete_adversario(uuid, uuid) to anon, authenticated;
  grant execute on function public.athlete_add_observacao(uuid, uuid, text) to anon, authenticated;
  grant execute on function public.athlete_delete_observacao(uuid, uuid) to anon, authenticated;


  -- ############################################################
  -- PARTE 11. COMPETIÇÕES
  -- ############################################################

  -- ------------------------------------------------------------
  -- 1. Competições do clube (mesmo público dos treinos)
  -- ------------------------------------------------------------
  create table if not exists public.competitions (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
    nome text not null check (length(trim(nome)) > 0),
    data date not null,
    data_pesagem date not null,
    hora_pesagem time,
    local text,
    observacoes text,
    audience text not null default 'todos',
    target_group_ids uuid[] not null default '{}',
    target_athlete_ids uuid[] not null default '{}',
    created_by uuid default auth.uid(),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint competitions_pesagem_antes check (data_pesagem <= data),
    constraint competitions_audience_check check (audience in ('todos', 'incluir', 'exceto'))
  );

  create index if not exists competitions_club_date_idx on public.competitions (club_id, data_pesagem);

  -- "Ninguém": competição cadastrada antes da convocação (não aparece para nenhum atleta)
  alter table public.competitions drop constraint if exists competitions_audience_check;
  alter table public.competitions
    add constraint competitions_audience_check check (audience in ('todos', 'incluir', 'exceto', 'ninguem'));

  -- Treinamento de campo: mesmo cadastro e mesmo público, sem pesagem, com início (data) e fim (data_fim).
  -- As competições já cadastradas continuam como 'competicao' (todas têm pesagem).
  alter table public.competitions add column if not exists tipo text not null default 'competicao';
  alter table public.competitions add column if not exists data_fim date;
  alter table public.competitions alter column data_pesagem drop not null;
  alter table public.competitions drop constraint if exists competitions_tipo_check;
  alter table public.competitions
    add constraint competitions_tipo_check check (
      (tipo = 'competicao' and data_pesagem is not null and data_fim is null)
      or (tipo = 'campo' and data_pesagem is null and hora_pesagem is null and (data_fim is null or data_fim >= data))
    );

  drop trigger if exists competitions_touch on public.competitions;
  create trigger competitions_touch before update on public.competitions
    for each row execute function public.training_sessions_touch();

  -- A mesma validação de público dos treinos: grupos e atletas do mesmo clube
  drop trigger if exists competitions_check_audience on public.competitions;
  create trigger competitions_check_audience before insert or update on public.competitions
    for each row execute function public.training_sessions_check_audience();

  -- ------------------------------------------------------------
  -- 1b. Resultado do atleta em cada competição
  -- * O atleta registra e edita pelo próprio app; não existe exclusão pelo atleta.
  -- * Colocação: 1, 2, 3, 5 ou 7. NULL = competiu, mas ficou sem colocação.
  -- * Lutas/vitórias/derrotas são opcionais, mas sempre as três juntas.
  -- ------------------------------------------------------------
  create table if not exists public.competition_results (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
    competition_id uuid not null references public.competitions(id) on delete cascade,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    colocacao integer,
    lutas integer,
    vitorias integer,
    derrotas integer,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint competition_results_competition_athlete_key unique (competition_id, athlete_id),
    constraint competition_results_colocacao_check check (colocacao is null or colocacao in (1, 2, 3, 5, 7)),
    constraint competition_results_stats_check check (
      (lutas is null and vitorias is null and derrotas is null)
      or (
        lutas is not null and lutas >= 0
        and vitorias is not null and vitorias >= 0
        and derrotas is not null and derrotas >= 0
        and vitorias + derrotas <= lutas
      )
    )
  );

  create index if not exists competition_results_club_idx on public.competition_results (club_id);
  create index if not exists competition_results_competition_idx on public.competition_results (competition_id);
  create index if not exists competition_results_athlete_idx on public.competition_results (athlete_id);

  drop trigger if exists competition_results_touch on public.competition_results;
  create trigger competition_results_touch before update on public.competition_results
    for each row execute function public.training_sessions_touch();

  -- A competição é para este atleta?
  create or replace function public.competition_applies_to(p_competition public.competitions, p_athlete uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select case p_competition.audience
      when 'todos' then true
      when 'ninguem' then false
      else (
        p_athlete = any(p_competition.target_athlete_ids)
        or exists (
          select 1 from public.athlete_group_members m
          where m.athlete_id = p_athlete and m.group_id = any(p_competition.target_group_ids)
        )
      ) = (p_competition.audience = 'incluir')
    end;
  $$;

  -- ------------------------------------------------------------
  -- 2. Visão do treinador: atletas do público + última pesagem
  -- ------------------------------------------------------------
  create or replace function public.coach_competition_summary(p_competition_id uuid)
  returns table (
    athlete_id uuid,
    nome text,
    categoria text,
    classe text,
    peso_atual numeric,
    peso_data date
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_competition public.competitions;
  begin
    if auth.uid() is null then
      raise exception 'nao_autorizado';
    end if;

    select c.* into v_competition
    from public.competitions c
    where c.id = p_competition_id
      and c.club_id = public.current_club_id();

    if not found then
      raise exception 'competicao_nao_encontrada';
    end if;

    return query
      select a.id, a.nome, a.categoria, a.classe, w.weight, w.date
      from public.athletes a
      left join lateral (
        select wr.weight, wr.date
        from public.weight_records wr
        where wr.athlete_id = a.id
        order by wr.date desc, wr.created_at desc
        limit 1
      ) w on true
      where a.club_id = v_competition.club_id
        and a.active
        and public.competition_applies_to(v_competition, a.id)
      order by a.nome;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 3. Atleta: competições destinadas a ele + última pesagem
  -- ------------------------------------------------------------
  create or replace function public.athlete_list_competitions(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete uuid := public._athlete_ready(p_token);
    v_club uuid;
    v_categoria text;
  begin
    select a.club_id, a.categoria into v_club, v_categoria
    from public.athletes a
    where a.id = v_athlete;

    return coalesce((
      select json_agg(row_to_json(x) order by coalesce(x.data_pesagem, x.data), x.data)
      from (
        select c.id, c.nome, c.tipo, c.data, c.data_fim, c.data_pesagem, c.hora_pesagem, c.local, c.observacoes,
               v_categoria as categoria,
               w.weight as peso_atual,
               w.date as peso_data
        from public.competitions c
        left join lateral (
          select wr.weight, wr.date
          from public.weight_records wr
          where wr.athlete_id = v_athlete
          order by wr.date desc, wr.created_at desc
          limit 1
        ) w on true
        where c.club_id = v_club
          and coalesce(c.data_fim, c.data) >= public.training_today() - 7
          and public.competition_applies_to(c, v_athlete)
      ) x
    ), '[]'::json);
  end;
  $$;

  -- ------------------------------------------------------------
  -- 3b. Atleta: competições passadas + resultado (para registrar/editar)
  -- ------------------------------------------------------------
  create or replace function public.athlete_list_competition_results(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete uuid := public._athlete_ready(p_token);
    v_club uuid;
    v_categoria text;
  begin
    select a.club_id, a.categoria into v_club, v_categoria
    from public.athletes a
    where a.id = v_athlete;

    return coalesce((
      select json_agg(row_to_json(x) order by x.data desc)
      from (
        select c.id as competition_id, c.nome, c.data, c.data_pesagem, c.hora_pesagem, c.local,
               v_categoria as categoria,
               case when r.id is null then null else json_build_object(
                 'id', r.id,
                 'colocacao', r.colocacao,
                 'lutas', r.lutas,
                 'vitorias', r.vitorias,
                 'derrotas', r.derrotas,
                 'updated_at', r.updated_at
               ) end as result
        from public.competitions c
        left join public.competition_results r
          on r.competition_id = c.id
         and r.athlete_id = v_athlete
        where c.club_id = v_club
          and c.tipo = 'competicao' -- treinamento de campo não tem resultado
          and (public.competition_applies_to(c, v_athlete) or r.id is not null)
      ) x
    ), '[]'::json);
  end;
  $$;

  -- O atleta registra/edita o próprio resultado. Não existe exclusão.
  create or replace function public.athlete_save_competition_result(
    p_token uuid,
    p_competition_id uuid,
    p_colocacao integer,
    p_lutas integer default null,
    p_vitorias integer default null,
    p_derrotas integer default null
  )
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete uuid := public._athlete_ready(p_token);
    v_competition public.competitions;
    v_club uuid;
    v_existing boolean;
  begin
    select a.club_id into v_club
    from public.athletes a
    where a.id = v_athlete;

    select c.* into v_competition
    from public.competitions c
    where c.id = p_competition_id
      and c.club_id = v_club
      and c.tipo = 'competicao';

    if not found then
      raise exception 'competicao_nao_encontrada';
    end if;

    if v_competition.data > public.training_today() then
      raise exception 'competicao_futura';
    end if;

    -- Depois da convocação, o público pode mudar: quem já registrou continua podendo editar.
    select exists (
      select 1 from public.competition_results r
      where r.competition_id = p_competition_id
        and r.athlete_id = v_athlete
    ) into v_existing;

    if not v_existing and not public.competition_applies_to(v_competition, v_athlete) then
      raise exception 'nao_autorizado';
    end if;

    if p_colocacao is not null and p_colocacao not in (1, 2, 3, 5, 7) then
      raise exception 'colocacao_invalida';
    end if;

    if (p_lutas is null) <> (p_vitorias is null)
       or (p_lutas is null) <> (p_derrotas is null) then
      raise exception 'estatisticas_incompletas';
    end if;

    if p_lutas is not null
       and (p_lutas < 0 or p_vitorias < 0 or p_derrotas < 0) then
      raise exception 'estatisticas_invalidas';
    end if;

    if p_lutas is not null and p_vitorias + p_derrotas > p_lutas then
      raise exception 'estatisticas_invalidas';
    end if;

    insert into public.competition_results (
      club_id, competition_id, athlete_id, colocacao, lutas, vitorias, derrotas
    )
    values (
      v_club, p_competition_id, v_athlete, p_colocacao, p_lutas, p_vitorias, p_derrotas
    )
    on conflict (competition_id, athlete_id) do update
      set club_id = excluded.club_id,
          colocacao = excluded.colocacao,
          lutas = excluded.lutas,
          vitorias = excluded.vitorias,
          derrotas = excluded.derrotas;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 3c. Comissão técnica: resultados de todas as competições do clube
  -- ------------------------------------------------------------
  create or replace function public.coach_competition_results_overview()
  returns table (
    athlete_id uuid,
    athlete_nome text,
    competition_id uuid,
    competition_nome text,
    competition_data date,
    colocacao integer,
    lutas integer,
    vitorias integer,
    derrotas integer,
    updated_at timestamp with time zone
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_club uuid;
  begin
    v_club := public.current_club_id();

    if auth.uid() is null or v_club is null then
      raise exception 'nao_autorizado';
    end if;

    return query
      select r.athlete_id, a.nome, r.competition_id, c.nome, c.data,
             r.colocacao, r.lutas, r.vitorias, r.derrotas, r.updated_at
      from public.competition_results r
      join public.competitions c on c.id = r.competition_id
      join public.athletes a on a.id = r.athlete_id
      where r.club_id = v_club
        and c.club_id = v_club
      order by c.data desc, a.nome;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 4. Regras de acesso (clube; escrita bloqueada no modo suporte)
  -- ------------------------------------------------------------
  alter table public.competitions enable row level security;
  revoke all on public.competitions from anon;
  grant select, insert, update, delete on public.competitions to authenticated;

  drop policy if exists "Competições: leitura" on public.competitions;
  drop policy if exists "Competições: inclusão" on public.competitions;
  drop policy if exists "Competições: alteração" on public.competitions;
  drop policy if exists "Competições: exclusão" on public.competitions;

  create policy "Competições: leitura" on public.competitions
    for select to authenticated
    using (club_id = (select public.current_club_id()));

  create policy "Competições: inclusão" on public.competitions
    for insert to authenticated
    with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);

  create policy "Competições: alteração" on public.competitions
    for update to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)
    with check (club_id = (select public.current_club_id()));

  create policy "Competições: exclusão" on public.competitions
    for delete to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);

  -- Resultados: a comissão técnica só lê (quem escreve é o atleta, pelas funções com token).
  alter table public.competition_results enable row level security;
  revoke all on public.competition_results from anon;
  grant select on public.competition_results to authenticated;

  drop policy if exists "Resultados de competições: leitura" on public.competition_results;
  create policy "Resultados de competições: leitura" on public.competition_results
    for select to authenticated
    using (club_id = (select public.current_club_id()));

  revoke execute on function public.competition_applies_to(public.competitions, uuid) from public, anon;
  grant execute on function public.competition_applies_to(public.competitions, uuid) to authenticated;

  revoke execute on function public.coach_competition_summary(uuid) from public, anon;
  grant execute on function public.coach_competition_summary(uuid) to authenticated;

  revoke execute on function public.athlete_list_competitions(uuid) from public;
  grant execute on function public.athlete_list_competitions(uuid) to anon, authenticated;

  revoke execute on function public.athlete_list_competition_results(uuid) from public;
  grant execute on function public.athlete_list_competition_results(uuid) to anon, authenticated;

  revoke execute on function public.athlete_save_competition_result(uuid, uuid, integer, integer, integer, integer) from public;
  grant execute on function public.athlete_save_competition_result(uuid, uuid, integer, integer, integer, integer) to anon, authenticated;

  revoke execute on function public.coach_competition_results_overview() from public, anon;
  grant execute on function public.coach_competition_results_overview() to authenticated;

  notify pgrst, 'reload schema';


  -- ############################################################
  -- PARTE 12. PREPARAÇÃO FÍSICA, UMA PSR/PESO POR DIA E GRUPOS
  -- * Catálogo de exercícios, fichas dos treinos físicos, PRs dos atletas e treinos
  --   concluídos: tudo por clube, com as mesmas regras de acesso das outras tabelas.
  -- * O atleta usa só as funções athlete_* (com o token da sessão): o banco descobre
  --   quem ele é; athlete_id nunca vem do navegador.
  -- * Tabelas criadas antes pelo painel são completadas (colunas, clube, regras).
  -- ############################################################

  -- ------------------------------------------------------------
  -- 1. Uma PSR e um peso por atleta por dia (a PSE pode ter várias: vários treinos)
  --    Nada é apagado: as funções de envio já recusam o segundo envio do dia. O índice
  --    único (trava extra no banco) só é criado quando não há repetidos antigos.
  -- ------------------------------------------------------------
  do $$
  begin
    if not exists (select 1 from public.psr_records group by athlete_id, date having count(*) > 1) then
      create unique index if not exists psr_records_um_por_dia on public.psr_records (athlete_id, date);
    else
      raise notice 'PSR repetidas no mesmo dia: índice único não criado (nada foi apagado).';
    end if;
    if not exists (select 1 from public.weight_records group by athlete_id, date having count(*) > 1) then
      create unique index if not exists weight_records_um_por_dia on public.weight_records (athlete_id, date);
    else
      raise notice 'Pesos repetidos no mesmo dia: índice único não criado (nada foi apagado).';
    end if;
  end $$;

  -- ------------------------------------------------------------
  -- 2. Catálogo de exercícios do clube
  -- ------------------------------------------------------------
  create table if not exists public.club_exercises (
    id uuid primary key default gen_random_uuid(),
    club_id uuid default public.current_club_id() references public.clubs(id) on delete cascade,
    nome text not null check (length(trim(nome)) between 1 and 80),
    bloco text default 'Geral',
    exige_pr boolean not null default true,
    created_at timestamp with time zone default now() not null
  );
  alter table public.club_exercises add column if not exists club_id uuid references public.clubs(id) on delete cascade;
  alter table public.club_exercises add column if not exists bloco text default 'Geral';
  alter table public.club_exercises add column if not exists exige_pr boolean default true;
  -- Exercício com barra olímpica de 20 kg: a ficha do atleta mostra as anilhas
  alter table public.club_exercises add column if not exists usa_barra boolean not null default true;
  alter table public.club_exercises add column if not exists created_at timestamp with time zone default now();

  -- Versões antigas exigiam nome único no sistema todo; agora é único por clube
  -- (índice club_exercises_nome_unico abaixo). Só troca a regra, não apaga dados.
  alter table public.club_exercises drop constraint if exists club_exercises_nome_key;
  drop index if exists public.club_exercises_nome_key;

  -- Catálogo antigo, sem clube (nada é apagado): os exercícios ficam com o clube mais
  -- antigo e os outros clubes recebem uma cópia (sem repetir nome que o clube já tem)
  do $$
  declare
    v_first uuid := (select id from public.clubs order by created_at, id limit 1);
  begin
    if v_first is not null and exists (select 1 from public.club_exercises where club_id is null) then
      insert into public.club_exercises (club_id, nome, bloco, exige_pr)
        select k.id, e.nome, e.bloco, coalesce(e.exige_pr, true)
        from public.club_exercises e cross join public.clubs k
        where e.club_id is null and k.id <> v_first
          and not exists (
            select 1 from public.club_exercises x
            where x.club_id = k.id and lower(trim(x.nome)) = lower(trim(e.nome))
          );
      update public.club_exercises set club_id = v_first where club_id is null;
    end if;
  end $$;
  alter table public.club_exercises alter column club_id set default public.current_club_id();
  -- (busca por clube: o índice de nome único do catálogo já cobre; ver parte 15)
  do $$
  begin
    create unique index if not exists club_exercises_nome_unico on public.club_exercises (club_id, lower(trim(nome)));
  exception when unique_violation then
    raise notice 'Catálogo com nomes repetidos no mesmo clube: índice único não criado. Remova os repetidos e rode de novo.';
  end $$;

  -- ------------------------------------------------------------
  -- 3. Ficha (prescrição) de cada treino físico do cronograma
  -- ------------------------------------------------------------
  create table if not exists public.workout_prescriptions (
    id uuid primary key default gen_random_uuid(),
    club_id uuid references public.clubs(id) on delete cascade,
    training_session_id uuid not null references public.training_sessions(id) on delete cascade,
    bloco text not null default 'Principal',
    exercicio text not null check (length(trim(exercicio)) between 1 and 80),
    series integer not null default 1 check (series between 1 and 50),
    repeticoes text not null default '',
    usa_pr boolean not null default false,
    porcentagem_pr numeric(5,2) check (porcentagem_pr is null or porcentagem_pr between 1 and 150),
    observacoes_tecnico text,
    created_at timestamp with time zone default now() not null
  );
  alter table public.workout_prescriptions add column if not exists club_id uuid references public.clubs(id) on delete cascade;
  alter table public.workout_prescriptions add column if not exists observacoes_tecnico text;
  -- Ordem do exercício na ficha (modelos e fichas novas). Sem posição = ordem de cadastro, antes dos com posição.
  alter table public.workout_prescriptions add column if not exists posicao integer;
  alter table public.workout_prescriptions add column if not exists created_at timestamp with time zone default now();

  -- Clube vem do treino. Ficha de um treino que já não existe fica guardada sem clube
  -- (não aparece para ninguém, mas nada é apagado). Fichas novas sempre ganham clube (gatilho abaixo).
  update public.workout_prescriptions w
    set club_id = s.club_id
  from public.training_sessions s
  where w.club_id is null and s.id::text = w.training_session_id::text;
  create index if not exists workout_prescriptions_session_idx on public.workout_prescriptions (training_session_id);

  -- Apagar o treino apaga a ficha dele
  do $$
  declare
    c record;
  begin
    if (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
        where a.attrelid = 'public.workout_prescriptions'::regclass and a.attname = 'training_session_id' and not a.attisdropped) = 'uuid' then
      for c in
        select conname from pg_constraint
        where conrelid = 'public.workout_prescriptions'::regclass and contype = 'f'
          and confrelid = 'public.training_sessions'::regclass and confdeltype <> 'c'
      loop
        execute format('alter table public.workout_prescriptions drop constraint %I', c.conname);
      end loop;
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.workout_prescriptions'::regclass and contype = 'f' and confrelid = 'public.training_sessions'::regclass
      ) then
        alter table public.workout_prescriptions
          add constraint workout_prescriptions_session_fk
          foreign key (training_session_id) references public.training_sessions(id) on delete cascade not valid;
      end if;
    end if;
  end $$;

  -- O clube da ficha é sempre o do treino (o treino precisa existir)
  create or replace function public.workout_prescriptions_set_club()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    select s.club_id into new.club_id from public.training_sessions s where s.id = new.training_session_id;
    if new.club_id is null then
      raise exception 'treino_nao_encontrado';
    end if;
    return new;
  end;
  $$;
  drop trigger if exists workout_prescriptions_set_club on public.workout_prescriptions;
  create trigger workout_prescriptions_set_club before insert or update of training_session_id on public.workout_prescriptions
    for each row execute function public.workout_prescriptions_set_club();

  -- ------------------------------------------------------------
  -- 4. PRs (carga máxima de 1 repetição) de cada atleta
  -- ------------------------------------------------------------
  create table if not exists public.athlete_prs (
    id uuid primary key default gen_random_uuid(),
    club_id uuid references public.clubs(id) on delete cascade,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    exercicio text not null,
    peso_pr numeric(6,2) not null check (peso_pr > 0 and peso_pr <= 500),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
  );
  alter table public.athlete_prs add column if not exists club_id uuid references public.clubs(id) on delete cascade;
  alter table public.athlete_prs add column if not exists created_at timestamp with time zone default now();
  alter table public.athlete_prs add column if not exists updated_at timestamp with time zone default now();

  update public.athlete_prs p
    set club_id = a.club_id
  from public.athletes a
  where p.club_id is null and a.id::text = p.athlete_id::text;
  -- PR de atleta que já não existe fica guardado sem clube (não aparece para ninguém).
  -- PRs novos sempre ganham o clube do atleta (gatilho abaixo).
  -- (busca por atleta: a regra "um PR por exercício" já cobre; ver parte 15)

  -- Clube do PR = clube do atleta (mesma regra das respostas)
  drop trigger if exists athlete_prs_set_club on public.athlete_prs;
  create trigger athlete_prs_set_club before insert or update of athlete_id on public.athlete_prs
    for each row execute function public.records_set_club();

  -- ------------------------------------------------------------
  -- 5. Treinos físicos concluídos (vale em qualquer aparelho)
  -- ------------------------------------------------------------
  create table if not exists public.workout_completions (
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    training_session_id uuid not null references public.training_sessions(id) on delete cascade,
    club_id uuid not null references public.clubs(id) on delete cascade,
    duration_minutes integer not null check (duration_minutes between 1 and 600),
    completed_at timestamp with time zone default now() not null,
    primary key (athlete_id, training_session_id)
  );

  -- ------------------------------------------------------------
  -- 6. Regras de acesso
  --    Treinador: o próprio clube (modo suporte: só leitura), igual às outras tabelas.
  --    Regras antigas criadas pelo painel são removidas (podiam liberar acesso anônimo).
  -- ------------------------------------------------------------
  do $$
  declare
    t text;
    p record;
  begin
    foreach t in array array['club_exercises', 'workout_prescriptions', 'athlete_prs', 'workout_completions']
    loop
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy %I on public.%I for select to authenticated using (club_id = (select public.current_club_id()))', 'Clube: leitura', t);
      -- treino concluído só é gravado pelo atleta (função abaixo)
      continue when t = 'workout_completions';
      execute format('create policy %I on public.%I for insert to authenticated with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: inclusão', t);
      execute format('create policy %I on public.%I for update to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null) with check (club_id = (select public.current_club_id()))', 'Clube: alteração', t);
      execute format('create policy %I on public.%I for delete to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)', 'Clube: exclusão', t);
    end loop;
  end $$;
  revoke insert, update, delete on public.workout_completions from authenticated;

  -- ------------------------------------------------------------
  -- 7. Funções do atleta
  -- ------------------------------------------------------------

  -- Treino que o atleta pode abrir: do clube dele, destinado a ele, a partir da semana passada
  create or replace function public._athlete_session(p_athlete uuid, p_session uuid)
  returns public.training_sessions
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_session public.training_sessions;
  begin
    select s.* into v_session
    from public.training_sessions s
    join public.athletes a on a.id = p_athlete and a.club_id = s.club_id
    where s.id = p_session
      and s.date >= public.training_week_start(public.training_today()) - 7
      and public.session_applies_to(s, p_athlete);
    if not found then
      raise exception 'registro_nao_encontrado';
    end if;
    return v_session;
  end;
  $$;

  -- Exercícios do catálogo que pedem PR e os PRs do atleta
  create or replace function public.athlete_list_prs(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_club uuid := (select a.club_id from public.athletes a where a.id = v_me);
  begin
    return json_build_object(
      'catalog', coalesce((
        select json_agg(json_build_object('id', e.id, 'nome', e.nome) order by lower(e.nome))
        from public.club_exercises e
        where e.club_id = v_club and e.exige_pr
      ), '[]'::json),
      'prs', coalesce((
        select json_agg(json_build_object('id', p.id, 'exercicio', p.exercicio, 'peso_pr', p.peso_pr, 'updated_at', p.updated_at) order by lower(p.exercicio))
        from public.athlete_prs p
        where p.athlete_id = v_me
      ), '[]'::json)
    );
  end;
  $$;

  -- Grava (ou atualiza) o PR do atleta num exercício do catálogo do clube
  create or replace function public.athlete_save_pr(p_token uuid, p_exercicio text, p_peso numeric)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_nome text;
  begin
    if p_peso is null or p_peso <= 0 or p_peso > 500 then
      raise exception 'pr_invalido';
    end if;
    select e.nome into v_nome
    from public.club_exercises e
    join public.athletes a on a.id = v_me and a.club_id = e.club_id
    where e.exige_pr and lower(trim(e.nome)) = lower(trim(coalesce(p_exercicio, '')))
    limit 1;
    if v_nome is null then
      raise exception 'exercicio_invalido';
    end if;
    update public.athlete_prs
      set peso_pr = round(p_peso, 2), exercicio = v_nome, updated_at = now()
    where athlete_id = v_me and lower(trim(exercicio)) = lower(trim(v_nome));
    if not found then
      insert into public.athlete_prs (athlete_id, exercicio, peso_pr) values (v_me, v_nome, round(p_peso, 2));
    end if;
  end;
  $$;

  create or replace function public.athlete_delete_pr(p_token uuid, p_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
  begin
    delete from public.athlete_prs where id = p_id and athlete_id = v_me;
    if not found then
      raise exception 'registro_nao_encontrado';
    end if;
  end;
  $$;

  -- Ficha do treino físico para o atleta: exercícios, PRs dele e se já concluiu
  create or replace function public.athlete_get_workout(p_token uuid, p_session uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_session public.training_sessions := public._athlete_session(v_me, p_session);
  begin
    return json_build_object(
      'session', json_build_object('id', v_session.id, 'name', v_session.name, 'date', v_session.date,
                                   'start_time', v_session.start_time, 'end_time', v_session.end_time,
                                   'notes', case when v_session.hide_notes then null else v_session.notes end),
      'prescriptions', coalesce((
        select json_agg(json_build_object(
                 'id', w.id, 'bloco', w.bloco, 'exercicio', w.exercicio, 'series', w.series, 'repeticoes', w.repeticoes,
                 'usa_pr', w.usa_pr, 'porcentagem_pr', w.porcentagem_pr, 'observacoes_tecnico', w.observacoes_tecnico,
                 'usa_barra', coalesce((
                   select e.usa_barra from public.club_exercises e
                   where e.club_id = v_session.club_id and lower(trim(e.nome)) = lower(trim(w.exercicio))
                   limit 1
                 ), true)
               ) order by w.posicao nulls first, w.created_at, w.id)
        from public.workout_prescriptions w
        where w.training_session_id = v_session.id
      ), '[]'::json),
      'prs', coalesce((
        select json_agg(json_build_object('exercicio', p.exercicio, 'peso_pr', p.peso_pr))
        from public.athlete_prs p
        where p.athlete_id = v_me
      ), '[]'::json),
      'completion', (
        select json_build_object('duration_minutes', c.duration_minutes, 'completed_at', c.completed_at)
        from public.workout_completions c
        where c.athlete_id = v_me and c.training_session_id = v_session.id
      )
    );
  end;
  $$;

  -- Atleta conclui o treino físico (a duração cronometrada vai para a PSE)
  create or replace function public.athlete_complete_workout(p_token uuid, p_session uuid, p_duration_minutes integer)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_session public.training_sessions := public._athlete_session(v_me, p_session);
  begin
    if p_duration_minutes is null or p_duration_minutes not between 1 and 600 then
      raise exception 'pse_duracao_valida';
    end if;
    insert into public.workout_completions (athlete_id, training_session_id, club_id, duration_minutes)
    values (v_me, v_session.id, v_session.club_id, p_duration_minutes)
    on conflict (athlete_id, training_session_id) do nothing;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 8. Grupo e participantes salvos de uma vez (tudo ou nada)
  --    Roda com as regras de acesso de quem chama (security invoker).
  -- ------------------------------------------------------------
  create or replace function public.club_save_group(p_id uuid, p_nome text, p_members uuid[])
  returns uuid
  language plpgsql
  volatile
  set search_path = ''
  as $$
  declare
    v_id uuid;
    v_members uuid[] := coalesce(p_members, '{}');
  begin
    if length(trim(coalesce(p_nome, ''))) = 0 then
      raise exception 'nome_obrigatorio';
    end if;
    if p_id is null then
      insert into public.athlete_groups (nome) values (trim(p_nome)) returning id into v_id;
    else
      update public.athlete_groups set nome = trim(p_nome) where id = p_id returning id into v_id;
      if v_id is null then
        raise exception 'nao_autorizado';
      end if;
    end if;
    delete from public.athlete_group_members m
    where m.group_id = v_id and not (m.athlete_id = any(v_members));
    insert into public.athlete_group_members (group_id, athlete_id)
    select v_id, x from unnest(v_members) x
    on conflict (group_id, athlete_id) do nothing;
    return v_id;
  end;
  $$;

  -- ------------------------------------------------------------
  -- 9. Permissões
  -- ------------------------------------------------------------
  revoke execute on function public.workout_prescriptions_set_club() from public, anon, authenticated;
  revoke execute on function public._athlete_session(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.athlete_list_prs(uuid) from public;
  revoke execute on function public.athlete_save_pr(uuid, text, numeric) from public;
  revoke execute on function public.athlete_delete_pr(uuid, uuid) from public;
  revoke execute on function public.athlete_get_workout(uuid, uuid) from public;
  revoke execute on function public.athlete_complete_workout(uuid, uuid, integer) from public;
  revoke execute on function public.club_save_group(uuid, text, uuid[]) from public, anon;
  grant execute on function public.athlete_list_prs(uuid) to anon, authenticated;
  grant execute on function public.athlete_save_pr(uuid, text, numeric) to anon, authenticated;
  grant execute on function public.athlete_delete_pr(uuid, uuid) to anon, authenticated;
  grant execute on function public.athlete_get_workout(uuid, uuid) to anon, authenticated;
  grant execute on function public.athlete_complete_workout(uuid, uuid, integer) to anon, authenticated;
  grant execute on function public.club_save_group(uuid, text, uuid[]) to authenticated;

  notify pgrst, 'reload schema';


  -- ############################################################
  -- PARTE 13. DESEMPENHO E TELA "HOJE" DO ATLETA
  -- * As regras de acesso usam (select public.current_club_id()): o banco calcula o
  --   clube uma vez por consulta, e não uma vez por linha.
  -- * Índices para as buscas por data e por atleta.
  -- * athlete_home: tudo o que a tela "Hoje" precisa numa consulta só.
  -- ############################################################

  -- ------------------------------------------------------------
  -- 1. Índices (só criam; não mudam dados)
  -- ------------------------------------------------------------
  create index if not exists pse_records_club_date_idx on public.pse_records (club_id, date);
  create index if not exists pse_records_athlete_date_idx on public.pse_records (athlete_id, date);
  create index if not exists psr_records_club_date_idx on public.psr_records (club_id, date);
  create index if not exists weight_records_club_date_idx on public.weight_records (club_id, date);
  create index if not exists training_sessions_club_date_idx on public.training_sessions (club_id, date);

  -- Busca por atleta e data em PSR e peso: o índice único "um por dia" já serve;
  -- se ele não pôde ser criado (dados antigos repetidos), cria um índice comum.
  do $$
  begin
    if to_regclass('public.psr_records_um_por_dia') is null then
      create index if not exists psr_records_athlete_date_idx on public.psr_records (athlete_id, date);
    end if;
    if to_regclass('public.weight_records_um_por_dia') is null then
      create index if not exists weight_records_athlete_date_idx on public.weight_records (athlete_id, date);
    end if;
  end $$;

  -- ------------------------------------------------------------
  -- 2. "Este treino/competição vale para o atleta?" só dentro das funções do banco
  --    (a chamada direta permitiria testar grupos de outros clubes)
  -- ------------------------------------------------------------
  revoke execute on function public.session_applies_to(public.training_sessions, uuid) from public, anon, authenticated;
  revoke execute on function public.competition_applies_to(public.competitions, uuid) from public, anon, authenticated;

  -- ------------------------------------------------------------
  -- 3. Sessão do atleta: já devolve o termo aceito e se falta o tutorial
  --    (menos idas ao servidor ao abrir o app)
  -- ------------------------------------------------------------
  -- Foto do atleta (o envio das fotos está em implementação)
  alter table public.athletes add column if not exists photo_url text;

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
        'categoria', p_athlete.categoria,
        'photo_url', p_athlete.photo_url
      ),
      'club', (
        select json_build_object('id', k.id, 'nome', k.nome, 'escudo_url', k.escudo_url)
        from public.clubs k where k.id = p_athlete.club_id
      ),
      'terms', json_build_object('accepted_at', p_athlete.terms_accepted_at, 'version', p_athlete.terms_version),
      'tutorial_pending', p_athlete.tutorial_done_at is null
    );
  $$;
  revoke execute on function public._athlete_session_json(uuid, public.athletes) from public, anon, authenticated;

  -- ------------------------------------------------------------
  -- 4. Tela "Hoje" do atleta: o que já respondeu hoje, treinos do dia e último peso
  -- ------------------------------------------------------------
  create or replace function public.athlete_home(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_club uuid;
    v_today date := public.training_today();
  begin
    select a.club_id into v_club from public.athletes a where a.id = v_me;

    return json_build_object(
      'today', v_today,
      'psr', (
        select json_build_object('id', r.id, 'created_at', r.created_at)
        from public.psr_records r
        where r.athlete_id = v_me and r.date = v_today
        order by r.created_at desc limit 1
      ),
      'weight', (
        select json_build_object('id', w.id, 'weight', w.weight, 'created_at', w.created_at)
        from public.weight_records w
        where w.athlete_id = v_me and w.date = v_today
        order by w.created_at desc limit 1
      ),
      'last_weight', (
        select json_build_object('weight', w.weight, 'date', w.date)
        from public.weight_records w
        where w.athlete_id = v_me
        order by w.date desc, w.created_at desc limit 1
      ),
      'pse', coalesce((
        select json_agg(json_build_object(
                 'id', p.id, 'training_type', p.training_type, 'rpe_score', p.rpe_score,
                 'did_not_train', p.did_not_train, 'duration_minutes', p.duration_minutes, 'created_at', p.created_at
               ) order by p.created_at)
        from public.pse_records p
        where p.athlete_id = v_me and p.date = v_today
      ), '[]'::json),
      'weigh_day', coalesce((
        select extract(isodow from v_today)::integer = any(s.weight_days)
        from public.club_reminder_settings s
        where s.club_id = v_club
      ), false),
      -- O clube usa preparação física com PR? (senão o app esconde a aba de PRs)
      'pr_catalog', exists (
        select 1 from public.club_exercises e where e.club_id = v_club and e.exige_pr
      ),
      'sessions', coalesce((
        select json_agg(json_build_object(
                 'id', s.id, 'date', s.date, 'start_time', s.start_time, 'end_time', s.end_time, 'name', s.name,
                 'training_type', s.training_type, 'expected_pse', s.expected_pse,
                 'notes', case when s.hide_notes then null else s.notes end,
                 'completed', exists (
                   select 1 from public.workout_completions c
                   where c.athlete_id = v_me and c.training_session_id = s.id
                 )
               ) order by s.start_time)
        from public.training_sessions s
        where s.club_id = v_club
          and s.date = v_today
          and public.session_applies_to(s, v_me)
      ), '[]'::json)
    );
  end;
  $$;

  revoke execute on function public.athlete_home(uuid) from public;
  grant execute on function public.athlete_home(uuid) to anon, authenticated;


  -- ############################################################
  -- PARTE 14. SITUAÇÃO DAS NOTIFICAÇÕES (PARA O TREINADOR)
  -- Quem recebe os lembretes, quem nunca ativou e quem teve o aparelho expirado.
  -- ############################################################
  create or replace function public.coach_push_status()
  returns table (
    athlete_id uuid,
    nome text,
    has_password boolean,
    active_devices integer,
    expired_devices integer,
    last_sent_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone
  )
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select a.id, a.nome,
           exists (select 1 from public.athlete_credentials c where c.athlete_id = a.id),
           (select count(*)::integer from public.push_subscriptions s where s.athlete_id = a.id and s.expired_at is null),
           (select count(*)::integer from public.push_subscriptions s where s.athlete_id = a.id and s.expired_at is not null),
           (select max(s.last_sent_at) from public.push_subscriptions s where s.athlete_id = a.id),
           (select s.last_error from public.push_subscriptions s where s.athlete_id = a.id and s.last_error is not null
             order by s.last_error_at desc nulls last limit 1),
           (select max(s.last_error_at) from public.push_subscriptions s where s.athlete_id = a.id)
    from public.athletes a
    where a.club_id = (select public.current_club_id()) and a.active
    order by a.nome;
  $$;

  revoke execute on function public.coach_push_status() from public, anon;
  grant execute on function public.coach_push_status() to authenticated;

  -- A função de envio grava o resultado de cada aparelho
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant all on public.push_subscriptions to service_role';
    end if;
  end $$;

  notify pgrst, 'reload schema';


  -- ############################################################
  -- PARTE 15. SEGURANÇA E INTEGRIDADE
  -- * Fecha regras de acesso que sobraram de versões antigas (a fisioterapia, que foi
  --   descontinuada, e uma tabela antiga de feedback aberta para qualquer pessoa).
  -- * Regras de valor que não chegaram às tabelas criadas antes deste arquivo.
  -- * Limite de tentativas no login do atleta.
  -- Nada aqui apaga dados. As sobras vazias saem com o supabase_limpeza.sql (opcional).
  -- ############################################################

  -- ------------------------------------------------------------
  -- 1. Regras de acesso que sobraram
  -- ------------------------------------------------------------
  do $$
  declare
    t text;
  begin
    -- Fisioterapia descontinuada: as regras "Fisio" pesavam em toda consulta destas tabelas
    foreach t in array array[
      'pse_records', 'psr_records', 'weight_records', 'training_sessions',
      'adversarios', 'adversario_observacoes', 'adversario_ocultos',
      'competitions', 'club_exercises', 'workout_prescriptions', 'athlete_prs',
      'workout_completions', 'club_reminder_settings', 'coaches'
    ]
    loop
      if to_regclass('public.' || t) is not null then
        execute format('drop policy if exists %I on public.%I', 'Fisio: sem acesso', t);
      end if;
    end loop;

    -- Tabela antiga de feedback (sem uso no app): estava aberta para qualquer pessoa, até sem login
    if to_regclass('public.athlete_workout_feedback') is not null then
      execute 'drop policy if exists "Acesso livre a feedback" on public.athlete_workout_feedback';
      execute 'revoke all on public.athlete_workout_feedback from anon, authenticated';
    end if;
  end $$;

  drop policy if exists "Fisio: não cadastra atleta" on public.athletes;
  drop policy if exists "Fisio: não altera atleta" on public.athletes;
  drop policy if exists "Fisio: não exclui atleta" on public.athletes;

  -- Papel "fisio" não existe mais (a regra só muda se ninguém estiver com esse papel)
  do $$
  begin
    if exists (select 1 from pg_constraint where conname = 'coaches_role_check' and pg_get_constraintdef(oid) like '%fisio%') then
      if exists (select 1 from public.coaches where role = 'fisio') then
        raise notice 'Há treinadores com o papel fisio: a regra de papéis continua aceitando fisio.';
      else
        alter table public.coaches drop constraint coaches_role_check;
        alter table public.coaches add constraint coaches_role_check check (role in ('admin', 'treinador'));
      end if;
    end if;
    if exists (select 1 from pg_constraint where conname = 'coach_invites_role_check' and pg_get_constraintdef(oid) like '%fisio%') then
      if exists (select 1 from public.coach_invites where role = 'fisio') then
        raise notice 'Há convites com o papel fisio: a regra de papéis dos convites continua aceitando fisio.';
      else
        alter table public.coach_invites drop constraint coach_invites_role_check;
        alter table public.coach_invites add constraint coach_invites_role_check check (role in ('admin', 'treinador'));
      end if;
    end if;
  end $$;

  -- ------------------------------------------------------------
  -- 2. Regras de valor que faltavam (tabelas criadas antes deste arquivo não as tinham).
  --    Só entram se os dados atuais já cumprem; senão, só avisam.
  -- ------------------------------------------------------------
  do $$
  declare
    r record;
    v_fora boolean;
  begin
    for r in
      select * from (values
        ('workout_prescriptions', 'workout_prescriptions_series_check', 'series between 1 and 50'),
        ('workout_prescriptions', 'workout_prescriptions_porcentagem_pr_check', 'porcentagem_pr is null or porcentagem_pr between 1 and 150'),
        ('workout_prescriptions', 'workout_prescriptions_exercicio_check', 'length(trim(exercicio)) between 1 and 80'),
        ('athlete_prs', 'athlete_prs_peso_pr_check', 'peso_pr > 0 and peso_pr <= 500'),
        ('club_exercises', 'club_exercises_nome_check', 'length(trim(nome)) between 1 and 80')
      ) as v(tabela, nome, regra)
    loop
      -- O nome é o mesmo que o Postgres dá à regra quando a tabela nasce deste arquivo
      continue when exists (
        select 1 from pg_constraint c where c.conname = r.nome and c.conrelid = ('public.' || r.tabela)::regclass
      );
      execute format('select exists (select 1 from public.%I where not (%s))', r.tabela, r.regra) into v_fora;
      if v_fora then
        raise notice 'Regra % não criada: há dados antigos fora dela em %.', r.nome, r.tabela;
      else
        execute format('alter table public.%I add constraint %I check (%s)', r.tabela, r.nome, r.regra);
      end if;
    end loop;

    -- "Exige PR" do catálogo sempre preenchido
    if not exists (select 1 from public.club_exercises where exige_pr is null) then
      alter table public.club_exercises alter column exige_pr set not null;
    end if;
  end $$;

  -- Regras criadas como "não conferidas" (NOT VALID) em versões antigas: confere agora.
  -- A que ainda tiver dado antigo fora da regra continua como está e só avisa.
  do $$
  declare
    r record;
  begin
    for r in
      select c.conname, c.conrelid::regclass as tabela
      from pg_constraint c
      where c.connamespace = 'public'::regnamespace and not c.convalidated
    loop
      begin
        execute format('alter table %s validate constraint %I', r.tabela, r.conname);
      exception when others then
        raise notice 'Regra % (%) ainda não conferida: há dados antigos fora dela.', r.conname, r.tabela;
      end;
    end loop;

    -- Regra repetida em adversários (criada pelo painel; a do arquivo é adversarios_autor_valido)
    if exists (select 1 from pg_constraint where conname = 'adversarios_autor_valido' and convalidated) then
      alter table public.adversarios drop constraint if exists adversarios_criado_por_tipo_check;
    end if;
  end $$;

  -- ------------------------------------------------------------
  -- 3. Índices: tira os repetidos (outro índice já cobre) e cria o que faltava
  -- ------------------------------------------------------------
  -- Clube + data (parte 13) já serve para buscar só pelo clube
  drop index if exists public.pse_records_club_idx;
  drop index if exists public.psr_records_club_idx;
  drop index if exists public.weight_records_club_idx;
  drop index if exists public.training_sessions_club_idx;
  -- "Um PR por exercício" (atleta + exercício) já serve para buscar pelo atleta
  drop index if exists public.athlete_prs_athlete_idx;
  -- Nome único do catálogo (clube + nome) já serve para buscar pelo clube
  do $$
  begin
    if to_regclass('public.club_exercises_nome_unico') is not null then
      drop index if exists public.club_exercises_club_idx;
    else
      create index if not exists club_exercises_club_idx on public.club_exercises (club_id);
    end if;
  end $$;
  -- Sessões vencidas saem a cada login: a tabela fica pequena e não precisa deste índice
  drop index if exists public.athlete_sessions_expires_idx;
  -- Treino excluído: acha rápido os treinos concluídos dele
  create index if not exists workout_completions_session_idx on public.workout_completions (training_session_id);

  -- ------------------------------------------------------------
  -- 4. Data padrão das respostas no horário de Brasília (o app sempre manda a data;
  --    isto só evita o dia errado se algo gravar sem data)
  -- ------------------------------------------------------------
  alter table public.pse_records alter column date set default public.training_today();
  alter table public.psr_records alter column date set default public.training_today();
  alter table public.weight_records alter column date set default public.training_today();

  -- ------------------------------------------------------------
  -- 5. Login do atleta com limite de tentativas (espera de 15 minutos)
  --    - Mesmo CPF: 5 erros seguidos.
  --    - Mesma rede (IP): 20 erros com CPF não cadastrado (alguém testando CPFs) ou 100 erros
  --      no total. Atleta errando a própria senha não trava os colegas no mesmo Wi-Fi do clube.
  --    As tentativas ficam guardadas; só as dos últimos 15 minutos contam.
  -- ------------------------------------------------------------
  create table if not exists public.athlete_login_attempts (
    id bigint generated always as identity primary key,
    cpf text not null,
    ip text,
    success boolean not null,
    cpf_cadastrado boolean not null default true,
    at timestamp with time zone not null default now()
  );
  alter table public.athlete_login_attempts add column if not exists cpf_cadastrado boolean not null default true;
  create index if not exists athlete_login_attempts_cpf_idx on public.athlete_login_attempts (cpf, at);
  create index if not exists athlete_login_attempts_ip_idx on public.athlete_login_attempts (ip, at);
  alter table public.athlete_login_attempts enable row level security;
  revoke all on public.athlete_login_attempts from anon, authenticated;

  create or replace function public.athlete_login(p_cpf text, p_password text)
  returns json
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
    v_headers json;
    v_ip text;
    v_athlete public.athletes;
    v_cadastrado boolean := false;
    v_hash text;
    v_ok boolean := false;
    v_token uuid;
  begin
    -- Rede de quem chama: cf-connecting-ip (posto pela Cloudflare, o aparelho não consegue trocar);
    -- sem ele, o primeiro endereço do x-forwarded-for. Sem nenhum, vale só o limite por CPF.
    begin
      v_headers := current_setting('request.headers', true)::json;
      v_ip := coalesce(
        nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
        nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
      );
    exception when others then
      v_ip := null;
    end;

    -- Muitas tentativas erradas (ver regras no título desta seção): espera 15 minutos
    if (select count(*) from public.athlete_login_attempts a
        where a.cpf = v_cpf and not a.success and a.at > now() - interval '15 minutes'
          and a.at > coalesce((select max(b.at) from public.athlete_login_attempts b where b.cpf = v_cpf and b.success), '-infinity')) >= 5
       or (v_ip is not null and (select count(*) filter (where not a.cpf_cadastrado) >= 20 or count(*) >= 100
           from public.athlete_login_attempts a
           where a.ip = v_ip and not a.success and a.at > now() - interval '15 minutes')) then
      return json_build_object('erro', 'muitas_tentativas');
    end if;

    select a.* into v_athlete
    from public.athletes a
    join public.clubs k on k.id = a.club_id
    where a.cpf = v_cpf and a.active and k.status = 'ativo';

    if found then
      v_cadastrado := true;
      select c.password_hash into v_hash from public.athlete_credentials c where c.athlete_id = v_athlete.id;
      if v_hash is null then
        -- Mesmo tempo de resposta em todos os casos (não revela quem ainda não criou senha)
        perform extensions.crypt('x', extensions.gen_salt('bf'));
        v_ok := public.athlete_initial_password(p_password) <> ''
          and public.athlete_initial_password(p_password) = public.athlete_initial_password(v_athlete.nome);
      else
        v_ok := v_hash = extensions.crypt(coalesce(p_password, ''), v_hash);
      end if;
    else
      -- Mesmo tempo de resposta com CPF que não existe (não revela quais CPFs existem)
      perform extensions.crypt('x', extensions.gen_salt('bf'));
    end if;

    -- O erro vira resposta (e não exceção) para a tentativa ficar registrada
    insert into public.athlete_login_attempts (cpf, ip, success, cpf_cadastrado) values (v_cpf, v_ip, v_ok, v_cadastrado);
    if not v_ok then
      return json_build_object('erro', 'credenciais_invalidas');
    end if;

    delete from public.athlete_sessions where expires_at < now();
    insert into public.athlete_sessions (athlete_id)
    values (v_athlete.id)
    returning token into v_token;

    return public._athlete_session_json(v_token, v_athlete);
  end;
  $$;

  revoke execute on function public.athlete_login(text, text) from public;
  grant execute on function public.athlete_login(text, text) to anon, authenticated;

  notify pgrst, 'reload schema';

  -- ############################################################
  -- PARTE 16. FOTO DO PRÓPRIO ATLETA
  -- * O atleta não usa o Supabase Auth, então o Storage não sabe quem ele é. A foto
  --   dele sobe pela Edge Function "foto-atleta" (supabase/functions/foto-atleta), que
  --   confere a sessão do app no banco (athlete_get_session) e grava com a chave do
  --   servidor. Nenhuma regra do Storage aceita envio sem login.
  -- * A versão anterior deixava enviar sem login: qualquer pessoa que soubesse o código
  --   do clube e o do atleta trocava a foto dele. As regras e funções dela saem aqui
  --   (são regras de acesso, não dados: as fotos continuam onde estão).
  -- ############################################################
  drop policy if exists "Fotos: atleta envia a própria foto" on storage.objects;
  drop policy if exists "Fotos: atleta substitui a própria foto" on storage.objects;
  drop function if exists public.athlete_photo_upload_allowed(text);
  drop function if exists public.athlete_set_photo(uuid, text);

  notify pgrst, 'reload schema';

  -- ############################################################
  -- PARTE 17. CONQUISTAS E CARTÕES PARA COMPARTILHAR (ATLETA)
  -- * Uma consulta só com o que o app precisa para a sequência de dias, os selos e os
  --   resumos da semana e do mês. As contas ficam no app (src/lib/achievements.ts).
  -- * Só leitura. Nada é publicado daqui: a imagem é feita no celular e quem decide
  --   compartilhar é o atleta.
  -- ############################################################
  create or replace function public.athlete_achievements(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_id uuid := public._athlete_ready(p_token);
    v_club uuid := (select a.club_id from public.athletes a where a.id = v_id);
    v_today date := public.training_today();
    v_from date := v_today - 400;
    -- Resumos: do começo do mês anterior (uma semana antes, para comparar) até hoje
    v_period date := (date_trunc('month', v_today) - interval '1 month')::date - 7;
  begin
    return json_build_object(
      'today', v_today,
      'categoria', (select a.categoria from public.athletes a where a.id = v_id),
      -- Dias com alguma resposta (PSR ou PSE), do mais novo para o mais antigo
      'dias_respondidos', coalesce((select json_agg(x.d order by x.d desc) from (
          select r.date as d from public.psr_records r where r.athlete_id = v_id and r.date between v_from and v_today
          union
          select p.date from public.pse_records p where p.athlete_id = v_id and p.date between v_from and v_today
        ) x), '[]'::json),
      -- Dias com treino programado para o atleta (dia de folga não quebra a sequência)
      'dias_treino', coalesce((select json_agg(x.d order by x.d desc) from (
          select distinct s.date as d
          from public.training_sessions s
          where s.club_id = v_club and s.date between v_from and v_today and public.session_applies_to(s, v_id)
        ) x), '[]'::json),
      'treinos', (select count(*) from public.pse_records p where p.athlete_id = v_id and not p.did_not_train),
      -- Data em que chegou a 10, 50, 100, 250 e 500 treinos
      'marcos_treinos', coalesce((select json_object_agg(t.n, t.date) from (
          select p.date, row_number() over (order by p.date, p.created_at) as n
          from public.pse_records p
          where p.athlete_id = v_id and not p.did_not_train
        ) t where t.n in (10, 50, 100, 250, 500)), '{}'::json),
      'pse', coalesce((select json_agg(json_build_object(
            'date', p.date, 'training_type', p.training_type, 'rpe_score', p.rpe_score,
            'duration_minutes', p.duration_minutes, 'did_not_train', p.did_not_train) order by p.date, p.created_at)
          from public.pse_records p
          where p.athlete_id = v_id and p.date between v_period and v_today), '[]'::json),
      'pesos', coalesce((select json_agg(json_build_object('date', w.date, 'weight', w.weight) order by w.date, w.created_at)
          from public.weight_records w
          where w.athlete_id = v_id and w.date between v_from and v_today), '[]'::json),
      -- Pesagens oficiais das competições do atleta (definem o limite de peso de cada dia)
      'pesagens', coalesce((select json_agg(c.data_pesagem order by c.data_pesagem)
          from public.competitions c
          where c.club_id = v_club and c.data_pesagem >= v_from and public.competition_applies_to(c, v_id)), '[]'::json),
      'prs', coalesce((select json_agg(json_build_object('exercicio', p.exercicio, 'peso_pr', p.peso_pr, 'updated_at', p.updated_at))
          from public.athlete_prs p
          where p.athlete_id = v_id), '[]'::json)
    );
  end;
  $$;

  revoke execute on function public.athlete_achievements(uuid) from public;
  grant execute on function public.athlete_achievements(uuid) to anon, authenticated;

  notify pgrst, 'reload schema';

  -- ############################################################
  -- PARTE 18. MODELOS DE FICHA DA PREPARAÇÃO FÍSICA
  -- * O treinador monta fichas prontas (blocos com exercícios) e reaproveita em outros
  --   treinos. Usar um modelo COPIA os exercícios para o treino: editar o modelo depois
  --   não muda os treinos que já o usaram.
  -- * blocos = [{ "id", "nome", "itens": [{ "id", "exercicio", "series", "repeticoes",
  --   "usa_pr", "porcentagem_pr", "observacoes_tecnico" }] }] (na ordem da ficha)
  -- ############################################################
  create table if not exists public.workout_templates (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
    nome text not null check (length(trim(nome)) between 1 and 80),
    descricao text check (descricao is null or length(descricao) <= 300),
    blocos jsonb not null default '[]'::jsonb check (jsonb_typeof(blocos) = 'array' and pg_column_size(blocos) < 100000),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
  );
  -- Nome único no clube (serve também para buscar pelo clube)
  create unique index if not exists workout_templates_nome_unico on public.workout_templates (club_id, lower(trim(nome)));

  alter table public.workout_templates enable row level security;
  revoke all on public.workout_templates from anon;
  drop policy if exists "Clube: leitura" on public.workout_templates;
  create policy "Clube: leitura" on public.workout_templates
    for select to authenticated using (club_id = (select public.current_club_id()));
  drop policy if exists "Clube: inclusão" on public.workout_templates;
  create policy "Clube: inclusão" on public.workout_templates
    for insert to authenticated with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);
  drop policy if exists "Clube: alteração" on public.workout_templates;
  create policy "Clube: alteração" on public.workout_templates
    for update to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)
    with check (club_id = (select public.current_club_id()));
  drop policy if exists "Clube: exclusão" on public.workout_templates;
  create policy "Clube: exclusão" on public.workout_templates
    for delete to authenticated using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);

  notify pgrst, 'reload schema';


  -- ############################################################
  -- PARTE 16. EVOLUÇÃO DOS PRs E CARD COMPARTILHÁVEL
  -- * athlete_prs guarda só o PR atual; aqui cada mudança de carga vira um ponto
  --   de histórico, o que permite mostrar a evolução e destacar o "novo PR".
  -- * Nada é apagado: o histórico só cresce (o PR atual continua em athlete_prs).
  -- ############################################################

  create table if not exists public.athlete_pr_history (
    id uuid primary key default gen_random_uuid(),
    club_id uuid references public.clubs(id) on delete cascade,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    exercicio text not null,
    peso_pr numeric(6,2) not null check (peso_pr > 0 and peso_pr <= 500),
    created_at timestamp with time zone default now() not null
  );

  create index if not exists athlete_pr_history_athlete_idx
    on public.athlete_pr_history (athlete_id, created_at);

  -- Clube do histórico = clube do atleta (mesma regra das respostas)
  create or replace function public.athlete_pr_history_set_club()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if new.club_id is null then
      select a.club_id into new.club_id from public.athletes a where a.id = new.athlete_id;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists athlete_pr_history_set_club on public.athlete_pr_history;
  create trigger athlete_pr_history_set_club before insert on public.athlete_pr_history
    for each row execute function public.athlete_pr_history_set_club();

  -- Cada PR criado ou alterado entra no histórico (só quando a carga muda)
  create or replace function public.athlete_prs_log_history()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if tg_op = 'INSERT' then
      insert into public.athlete_pr_history (club_id, athlete_id, exercicio, peso_pr)
      values (new.club_id, new.athlete_id, new.exercicio, new.peso_pr);
    elsif new.peso_pr is distinct from old.peso_pr
       or lower(trim(new.exercicio)) is distinct from lower(trim(old.exercicio)) then
      insert into public.athlete_pr_history (club_id, athlete_id, exercicio, peso_pr)
      values (new.club_id, new.athlete_id, new.exercicio, new.peso_pr);
    end if;
    return new;
  end;
  $$;

  drop trigger if exists athlete_prs_log_history on public.athlete_prs;
  create trigger athlete_prs_log_history after insert or update on public.athlete_prs
    for each row execute function public.athlete_prs_log_history();

  -- PRs que já existiam ganham o primeiro ponto (só se ainda não tiverem nenhum)
  insert into public.athlete_pr_history (club_id, athlete_id, exercicio, peso_pr, created_at)
  select p.club_id, p.athlete_id, p.exercicio, p.peso_pr, coalesce(p.updated_at, p.created_at, now())
  from public.athlete_prs p
  where not exists (
    select 1 from public.athlete_pr_history h
    where h.athlete_id = p.athlete_id
      and lower(trim(h.exercicio)) = lower(trim(p.exercicio))
  );

  alter table public.athlete_pr_history enable row level security;
  revoke all on public.athlete_pr_history from anon;
  grant select on public.athlete_pr_history to authenticated;

  drop policy if exists "Clube: leitura do histórico de PRs" on public.athlete_pr_history;
  create policy "Clube: leitura do histórico de PRs" on public.athlete_pr_history
    for select to authenticated
    using (club_id = (select public.current_club_id()));
  -- Escrita: só pelo gatilho acima (nenhuma política de escrita para o clube).

  revoke execute on function public.athlete_pr_history_set_club() from public, anon, authenticated;
  revoke execute on function public.athlete_prs_log_history() from public, anon, authenticated;

  -- Exercícios com PR e os PRs do atleta, agora com o histórico de cada exercício
  create or replace function public.athlete_list_prs(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_club uuid := (select a.club_id from public.athletes a where a.id = v_me);
  begin
    return json_build_object(
      'catalog', coalesce((
        select json_agg(json_build_object('id', e.id, 'nome', e.nome) order by lower(e.nome))
        from public.club_exercises e
        where e.club_id = v_club and e.exige_pr
      ), '[]'::json),
      'prs', coalesce((
        select json_agg(json_build_object(
          'id', p.id,
          'exercicio', p.exercicio,
          'peso_pr', p.peso_pr,
          'updated_at', p.updated_at,
          'history', coalesce((
            select json_agg(json_build_object('peso_pr', h.peso_pr, 'created_at', h.created_at) order by h.created_at)
            from (
              select hh.peso_pr, hh.created_at
              from public.athlete_pr_history hh
              where hh.athlete_id = p.athlete_id
                and lower(trim(hh.exercicio)) = lower(trim(p.exercicio))
              order by hh.created_at desc
              limit 50
            ) h
          ), '[]'::json)
        ) order by lower(p.exercicio))
        from public.athlete_prs p
        where p.athlete_id = v_me
      ), '[]'::json)
    );
  end;
  $$;

  revoke execute on function public.athlete_list_prs(uuid) from public;
  grant execute on function public.athlete_list_prs(uuid) to anon, authenticated;

  notify pgrst, 'reload schema';

  -- ############################################################
  -- PARTE 17. COMPOSIÇÃO CORPORAL (DOBRAS CUTÂNEAS)
  -- * O treinador mede as 7 dobras de Jackson & Pollock (1978); o app calcula o %G,
  --   a massa magra e a massa de gordura e guarda o resultado aqui.
  -- * O atleta vê o percentual, a evolução e um mapa de calor relativo das dobras
  --   (os valores em milímetros continuam na tela da comissão técnica).
  -- ############################################################

  create table if not exists public.body_compositions (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null default public.current_club_id() references public.clubs(id) on delete cascade,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    date date not null default public.training_today(),
    idade integer not null check (idade between 5 and 100),
    sexo text not null default 'Masculino' check (sexo in ('Masculino', 'Feminino')),
    peso numeric(5,1) check (peso between 20 and 250),
    -- Dobras em milímetros (as 7 do protocolo + as 2 extras da planilha)
    dobra_peitoral numeric(4,1) not null check (dobra_peitoral between 1 and 90),
    dobra_axilar numeric(4,1) not null check (dobra_axilar between 1 and 90),
    dobra_triceps numeric(4,1) not null check (dobra_triceps between 1 and 90),
    dobra_subescapular numeric(4,1) not null check (dobra_subescapular between 1 and 90),
    dobra_abdominal numeric(4,1) not null check (dobra_abdominal between 1 and 90),
    dobra_suprailiaca numeric(4,1) not null check (dobra_suprailiaca between 1 and 90),
    dobra_coxa numeric(4,1) not null check (dobra_coxa between 1 and 90),
    dobra_bicipital numeric(4,1) check (dobra_bicipital is null or dobra_bicipital between 1 and 90),
    dobra_panturrilha numeric(4,1) check (dobra_panturrilha is null or dobra_panturrilha between 1 and 90),
    -- Resultado calculado pelo app (soma das 7 dobras, densidade e Siri)
    soma_dobras numeric(5,1) not null check (soma_dobras between 7 and 630),
    densidade numeric(6,4) not null check (densidade > 0),
    percentual numeric(5,2) not null check (percentual between 1 and 70),
    massa_magra numeric(5,1) check (massa_magra is null or massa_magra between 1 and 250),
    massa_gorda numeric(5,1) check (massa_gorda is null or massa_gorda between 0 and 250),
    observacoes text,
    created_by uuid default auth.uid() references auth.users(id) on delete set null,
    created_at timestamp with time zone default now() not null
  );

  create index if not exists body_compositions_club_idx on public.body_compositions (club_id);
  create index if not exists body_compositions_athlete_idx on public.body_compositions (athlete_id, date);

  -- Uma avaliação por atleta por dia (nada é apagado: o app edita a do dia)
  do $$
  begin
    if not exists (select 1 from public.body_compositions group by athlete_id, date having count(*) > 1) then
      create unique index if not exists body_compositions_um_por_dia
        on public.body_compositions (athlete_id, date);
    else
      raise notice 'Avaliações repetidas no mesmo dia: índice único não criado (nada foi apagado).';
    end if;
  end $$;

  -- Clube da avaliação = clube do atleta (mesma regra das respostas)
  drop trigger if exists body_compositions_set_club on public.body_compositions;
  create trigger body_compositions_set_club before insert or update of athlete_id on public.body_compositions
    for each row execute function public.records_set_club();

  -- Regras de acesso: o clube (modo suporte: só leitura), igual às outras tabelas
  alter table public.body_compositions enable row level security;
  revoke all on public.body_compositions from anon;
  grant select, insert, update, delete on public.body_compositions to authenticated;

  drop policy if exists "Clube: leitura" on public.body_compositions;
  drop policy if exists "Clube: inclusão" on public.body_compositions;
  drop policy if exists "Clube: alteração" on public.body_compositions;
  drop policy if exists "Clube: exclusão" on public.body_compositions;
  create policy "Clube: leitura" on public.body_compositions
    for select to authenticated using (club_id = (select public.current_club_id()));
  create policy "Clube: inclusão" on public.body_compositions
    for insert to authenticated
    with check (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);
  create policy "Clube: alteração" on public.body_compositions
    for update to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null)
    with check (club_id = (select public.current_club_id()));
  create policy "Clube: exclusão" on public.body_compositions
    for delete to authenticated
    using (club_id = (select public.current_club_id()) and (select public.support_club_id()) is null);

  -- Atleta: percentual, evolução e dobras (estas para o mapa de calor da silhueta)
  create or replace function public.athlete_body_composition(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_sexo text;
  begin
    select a.sexo into v_sexo from public.athletes a where a.id = v_me;
    return json_build_object(
      'sexo', v_sexo,
      'history', coalesce((
        select json_agg(json_build_object(
                 'date', b.date,
                 'percentual', b.percentual,
                 'peso', b.peso,
                 'massa_magra', b.massa_magra,
                 'massa_gorda', b.massa_gorda,
                 'folds', json_build_object(
                   'peitoral', b.dobra_peitoral,
                   'axilar', b.dobra_axilar,
                   'triceps', b.dobra_triceps,
                   'subescapular', b.dobra_subescapular,
                   'abdominal', b.dobra_abdominal,
                   'suprailiaca', b.dobra_suprailiaca,
                   'coxa', b.dobra_coxa,
                   'bicipital', b.dobra_bicipital,
                   'panturrilha', b.dobra_panturrilha
                 )
               ) order by b.date)
        from public.body_compositions b
        where b.athlete_id = v_me
      ), '[]'::json)
    );
  end;
  $$;

  revoke execute on function public.athlete_body_composition(uuid) from public;
  grant execute on function public.athlete_body_composition(uuid) to anon, authenticated;

  -- ------------------------------------------------------------
  -- PARTE 18. DATA DE NASCIMENTO DO ATLETA
  --   Serve para a idade correta no % de gordura e para o app lembrar
  --   do aniversário. Nada muda nas regras de acesso já existentes:
  --   o treinador continua lendo a tabela athletes pelas políticas do clube,
  --   e o atleta lê/grava o próprio perfil por funções que conferem o token.
  -- ------------------------------------------------------------
  alter table public.athletes add column if not exists birth_date date;
  -- Nome de exibição escolhido pelo atleta no perfil. NULL = usa o nome do cadastro.
  -- É só do app do atleta: o cadastro (e o que a comissão técnica vê) não muda.
  alter table public.athletes add column if not exists display_name text;

  -- Perfil do atleta: nome do cadastro, nome de exibição, nascimento e foto.
  create or replace function public.athlete_my_profile(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete public.athletes;
  begin
    v_athlete := public._athlete_from_token(p_token);

    return json_build_object(
      'nome', v_athlete.nome,
      'display_name', v_athlete.display_name,
      'birth_date', v_athlete.birth_date,
      'photo_url', v_athlete.photo_url
    );
  end;
  $$;

  -- Atualiza o nome de exibição e a data de nascimento do próprio atleta.
  -- O cadastro do clube (public.athletes.nome) nunca é alterado por esta função.
  create or replace function public.athlete_update_profile(p_token uuid, p_nome text, p_birth_date date)
  returns json
  language plpgsql
  volatile
  security definer
  set search_path = ''
  as $$
  declare
    v_athlete public.athletes;
    v_nome text;
    v_display text;
  begin
    v_athlete := public._athlete_from_token(p_token);
    v_nome := btrim(coalesce(p_nome, ''));

    if length(v_nome) < 2 or length(v_nome) > 60 then
      raise exception 'nome_invalido';
    end if;

    if p_birth_date is null
      or p_birth_date < date '1900-01-01'
      or p_birth_date > public.training_today() then
      raise exception 'nascimento_invalido';
    end if;

    -- Igual ao nome do cadastro = limpa o apelido (volta a usar o nome oficial)
    v_display := case when lower(v_nome) = lower(btrim(v_athlete.nome)) then null else v_nome end;

    update public.athletes a
      set display_name = v_display, birth_date = p_birth_date
      where a.id = v_athlete.id;

    return json_build_object(
      'nome', v_athlete.nome,
      'display_name', v_display,
      'birth_date', p_birth_date,
      'photo_url', v_athlete.photo_url
    );
  end;
  $$;

  revoke execute on function public.athlete_my_profile(uuid) from public;
  grant execute on function public.athlete_my_profile(uuid) to anon, authenticated;
  revoke execute on function public.athlete_update_profile(uuid, text, date) from public;
  grant execute on function public.athlete_update_profile(uuid, text, date) to anon, authenticated;

  -- ------------------------------------------------------------
  -- PARTE 19. WHOOP (CONEXÃO POR ATLETA)
  -- * Cada atleta conecta a própria conta WHOOP pelo perfil no app (OAuth 2.0).
  --   Os tokens ficam em public.whoop_connections, que NINGUÉM lê pelo app:
  --   só a Edge Function "whoop" (chave do servidor) acessa a tabela.
  -- * A Edge Function busca recuperação, sono e ciclos (strain) e grava um
  --   resumo por dia em public.whoop_metrics. A comissão técnica lê esses
  --   números (RLS do clube); o atleta lê os próprios por função com token.
  -- ------------------------------------------------------------

  create table if not exists public.whoop_connections (
    athlete_id uuid primary key references public.athletes(id) on delete cascade,
    whoop_user_id text,
    whoop_name text,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamp with time zone not null,
    scope text,
    last_sync_at timestamp with time zone,
    last_error text,
    connected_at timestamp with time zone not null default now()
  );

  -- Sem políticas de acesso: só a chave do servidor (Edge Function) entra aqui.
  alter table public.whoop_connections enable row level security;
  revoke all on public.whoop_connections from anon, authenticated;

  -- Pedido de conexão em andamento: a WHOOP exige um `state` de 8 caracteres e
  -- ele volta na resposta. Guardado aqui para saber de qual atleta é a volta.
  create table if not exists public.whoop_pending_states (
    state text primary key,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    origin text,
    created_at timestamp with time zone not null default now()
  );

  alter table public.whoop_pending_states enable row level security;
  revoke all on public.whoop_pending_states from anon, authenticated;

  create table if not exists public.whoop_metrics (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null references public.clubs(id) on delete cascade,
    athlete_id uuid not null references public.athletes(id) on delete cascade,
    date date not null,
    recovery_score integer check (recovery_score is null or recovery_score between 0 and 100),
    hrv_ms numeric(6,2),
    resting_hr integer,
    spo2 numeric(4,2),
    skin_temp numeric(4,2),
    sleep_hours numeric(4,2),
    sleep_performance integer check (sleep_performance is null or sleep_performance between 0 and 100),
    sleep_efficiency numeric(5,2),
    strain numeric(5,2),
    day_kj numeric(8,1),
    steps integer,
    avg_hr integer,
    max_hr integer,
    updated_at timestamp with time zone not null default now()
  );

  create index if not exists whoop_metrics_club_idx on public.whoop_metrics (club_id);
  create index if not exists whoop_metrics_athlete_idx on public.whoop_metrics (athlete_id, date desc);
  create unique index if not exists whoop_metrics_um_por_dia on public.whoop_metrics (athlete_id, date);

  -- A comissão técnica só lê (quem grava é a Edge Function, com a chave do servidor).
  alter table public.whoop_metrics enable row level security;
  revoke all on public.whoop_metrics from anon;
  revoke insert, update, delete on public.whoop_metrics from authenticated;
  grant select on public.whoop_metrics to authenticated;

  -- O clube que enxerga a métrica é o clube ATUAL do atleta (não o clube gravado
  -- no dia). Assim, se o atleta mudar de clube, o clube antigo deixa de ver os dados.
  drop policy if exists "Clube: leitura" on public.whoop_metrics;
  create policy "Clube: leitura" on public.whoop_metrics
    for select to authenticated using (
      exists (
        select 1
        from public.athletes a
        where a.id = whoop_metrics.athlete_id
          and a.club_id = (select public.current_club_id())
      )
    );

  -- A Edge Function usa a chave do servidor (service_role) para gravar tokens e números.
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant all on public.whoop_connections, public.whoop_pending_states, public.whoop_metrics to service_role';
    end if;
  end $$;

  -- Situação da conexão + últimos 14 dias de números (a comissão técnica vê).
  create or replace function public.club_whoop_status(p_athlete_id uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_club uuid := public.current_club_id();
    v_conn public.whoop_connections;
  begin
    if v_club is null then
      raise exception 'nao_autorizado';
    end if;
    if not exists (select 1 from public.athletes a where a.id = p_athlete_id and a.club_id = v_club) then
      raise exception 'nao_autorizado';
    end if;

    select * into v_conn from public.whoop_connections c where c.athlete_id = p_athlete_id;
    if not found then
      return json_build_object('connected', false, 'days', '[]'::json);
    end if;

    return json_build_object(
      'connected', true,
      'whoop_name', v_conn.whoop_name,
      'connected_at', v_conn.connected_at,
      'last_sync_at', v_conn.last_sync_at,
      'last_error', v_conn.last_error,
      'days', coalesce((
        select json_agg(json_build_object(
                 'date', m.date,
                 'recovery_score', m.recovery_score,
                 'hrv_ms', m.hrv_ms,
                 'resting_hr', m.resting_hr,
                 'spo2', m.spo2,
                 'sleep_hours', m.sleep_hours,
                 'sleep_performance', m.sleep_performance,
                 'sleep_efficiency', m.sleep_efficiency,
                 'strain', m.strain,
                 'day_kj', m.day_kj,
                 'steps', m.steps,
                 'avg_hr', m.avg_hr,
                 'max_hr', m.max_hr
               ) order by m.date desc)
        from public.whoop_metrics m
        where m.athlete_id = p_athlete_id
          and m.date >= public.training_today() - 13
      ), '[]'::json)
    );
  end;
  $$;

  -- O atleta vê a própria conexão e os próprios números (o banco acha quem é pelo token).
  create or replace function public.athlete_whoop(p_token uuid)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_me uuid := public._athlete_ready(p_token);
    v_conn public.whoop_connections;
  begin
    select * into v_conn from public.whoop_connections c where c.athlete_id = v_me;
    if not found then
      return json_build_object('connected', false, 'days', '[]'::json);
    end if;

    return json_build_object(
      'connected', true,
      'whoop_name', v_conn.whoop_name,
      'connected_at', v_conn.connected_at,
      'last_sync_at', v_conn.last_sync_at,
      'last_error', v_conn.last_error,
      'days', coalesce((
        select json_agg(json_build_object(
                 'date', m.date,
                 'recovery_score', m.recovery_score,
                 'hrv_ms', m.hrv_ms,
                 'resting_hr', m.resting_hr,
                 'sleep_hours', m.sleep_hours,
                 'sleep_performance', m.sleep_performance,
                 'strain', m.strain,
                 'day_kj', m.day_kj,
                 'steps', m.steps
               ) order by m.date desc)
        from public.whoop_metrics m
        where m.athlete_id = v_me
          and m.date >= public.training_today() - 13
      ), '[]'::json)
    );
  end;
  $$;

  revoke execute on function public.club_whoop_status(uuid) from public;
  grant execute on function public.club_whoop_status(uuid) to authenticated;
  revoke execute on function public.athlete_whoop(uuid) from public;
  grant execute on function public.athlete_whoop(uuid) to anon, authenticated;

  -- Sincronização diária (OPCIONAL). Sem isso, os dados só são relidos quando o
  -- atleta/treinador toca em "Atualizar/Sincronizar". Passo a passo, depois de
  -- publicar a função e criar o segredo CRON_SECRET em Edge Functions -> Secrets
  -- (o MESMO texto nos dois lugares):
  --
  --   select vault.create_secret('<texto-aleatorio-longo>', 'cron_whoop');
  --   select cron.unschedule('sincronizar-whoop');
  --   select cron.schedule('sincronizar-whoop', '0 9 * * *', $job$
  --     select net.http_post(
  --       url := 'https://<ref>.supabase.co/functions/v1/whoop',
  --       headers := jsonb_build_object(
  --         'Content-Type', 'application/json',
  --         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_whoop')),
  --       body := '{"action":"sync_all"}'::jsonb
  --     ) $job$);
  --
  -- 09:00 UTC = 06:00 em Brasília. Requer as extensões pg_cron e pg_net.
  -- Para parar: select cron.unschedule('sincronizar-whoop');

  notify pgrst, 'reload schema';
