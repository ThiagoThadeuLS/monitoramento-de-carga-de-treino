-- ============================================================
-- LIMPEZA DE SOBRAS DO BANCO (opcional; rode DEPOIS do supabase_completo.sql atualizado)
-- Como aplicar: Supabase -> SQL Editor -> cole ESTE ARQUIVO INTEIRO -> Run.
-- Pode rodar mais de uma vez. Se algo der errado, nada é alterado (tudo ou nada).
--
-- Sai, só se estiver vazio ou sem uso (se tiver dado, a parte é pulada e avisa):
--   * fisioterapia (descontinuada): 6 tabelas, as funções e as regras de acesso dela;
--   * tabela antiga athlete_workout_feedback (nenhuma tela usa);
--   * colunas antigas das fichas físicas: ordem, audience, target_group_ids, target_athlete_ids;
--   * funções que nada mais chama: purge_old_training_sessions e athlete_remove_push.
-- Não mexe nas fotos (bucket "fotos" e funções de foto: em implementação).
--
-- DADOS que saem (travas ligadas abaixo; troque para false para não apagar):
--   * fichas físicas soltas (apontam para treinos que não existem mais; ninguém as vê);
--   * pesos repetidos no mesmo dia (fica o último registro de cada dia). Depois disso o
--     banco passa a recusar um segundo peso do mesmo atleta no mesmo dia.
-- ============================================================
do $$
declare
  c_apagar_fichas_soltas   constant boolean := true;
  c_apagar_pesos_repetidos constant boolean := true;

  v_n bigint := 0;
  t text;
  v_usado boolean;
  r record;
begin
  -- 0. O supabase_completo.sql atualizado precisa ter rodado antes: ele tira a fisioterapia
  --    das outras funções e das regras de acesso das outras tabelas (e cria a parte 15).
  if to_regclass('public.athlete_login_attempts') is null or exists (
       select 1 from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.prosrc like '%is_fisio%'
         and p.proname not in ('is_fisio', 'coach_physio_summary', 'coach_physio_case_detail', 'athlete_physio', 'athlete_physio_checkin')
     )
     or exists (
       select 1 from pg_policies
       where schemaname = 'public' and policyname like 'Fisio: %' and tablename not like 'physio\_%'
     ) then
    raise exception 'Rode primeiro o supabase_completo.sql atualizado e depois esta limpeza.';
  end if;

  -- 1. Fisioterapia (descontinuada)
  foreach t in array array['physio_checkins', 'physio_criteria', 'physio_prescriptions', 'physio_sessions', 'physio_cases', 'physio_exercises']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      exit when v_n > 0;
    end if;
  end loop;
  if v_n > 0 then
    raise notice 'Fisioterapia: há dados guardados (% linhas em %). Nada foi removido.', v_n, t;
  else
    drop table if exists public.physio_checkins, public.physio_criteria, public.physio_prescriptions,
                         public.physio_sessions, public.physio_cases, public.physio_exercises;
    drop function if exists public.athlete_physio(uuid);
    drop function if exists public.athlete_physio_checkin(uuid, uuid, boolean, integer, integer, text);
    drop function if exists public.coach_physio_summary();
    drop function if exists public.coach_physio_case_detail(uuid);
    drop function if exists public.physio_cases_check();
    drop function if exists public.physio_child_check();
    drop function if exists public.is_fisio();
    raise notice 'Fisioterapia removida (tabelas vazias, funções e regras de acesso).';
  end if;

  -- 1b. Funções que nada mais chama
  drop function if exists public.purge_old_training_sessions();
  drop function if exists public.athlete_remove_push(uuid, text);

  -- 2. Tabela antiga de feedback dos treinos (nenhuma tela usa)
  if to_regclass('public.athlete_workout_feedback') is not null then
    select count(*) into v_n from public.athlete_workout_feedback;
    if v_n > 0 then
      raise notice 'athlete_workout_feedback tem % linhas: não foi removida.', v_n;
    else
      drop table public.athlete_workout_feedback;
      raise notice 'Tabela athlete_workout_feedback removida (estava vazia).';
    end if;
  end if;

  -- 3. Colunas antigas das fichas físicas (sem uso): saem só as que estão no padrão em todas as linhas
  for r in
    select * from (values
      ('ordem', 'coalesce(ordem, 0) <> 0'),
      ('audience', 'coalesce(audience, ''todos'') <> ''todos'''),
      ('target_group_ids', 'coalesce(array_length(target_group_ids, 1), 0) > 0'),
      ('target_athlete_ids', 'coalesce(array_length(target_athlete_ids, 1), 0) > 0')
    ) as v(coluna, em_uso)
  loop
    continue when not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workout_prescriptions' and column_name = r.coluna
    );
    execute format('select exists (select 1 from public.workout_prescriptions where %s)', r.em_uso) into v_usado;
    if v_usado then
      raise notice 'Coluna workout_prescriptions.% tem valores: não foi removida.', r.coluna;
    else
      execute format('alter table public.workout_prescriptions drop column %I', r.coluna);
      raise notice 'Coluna antiga workout_prescriptions.% removida.', r.coluna;
    end if;
  end loop;

  -- 4. Fichas físicas soltas (DADOS DE TESTE; trava c_apagar_fichas_soltas)
  select count(*) into v_n
  from public.workout_prescriptions w
  where not exists (select 1 from public.training_sessions s where s.id = w.training_session_id);
  if v_n > 0 and c_apagar_fichas_soltas then
    delete from public.workout_prescriptions w
    where not exists (select 1 from public.training_sessions s where s.id = w.training_session_id);
    raise notice 'Fichas físicas soltas apagadas: %.', v_n;
    begin
      alter table public.workout_prescriptions validate constraint workout_prescriptions_session_fk;
    exception when others then
      raise notice 'Regra workout_prescriptions_session_fk: %', sqlerrm;
    end;
  elsif v_n > 0 then
    raise notice 'Há % fichas físicas soltas (trava desligada: nada apagado).', v_n;
  end if;

  -- 5. Pesos repetidos no mesmo dia (DADOS DE TESTE; trava c_apagar_pesos_repetidos)
  select count(*) into v_n
  from (select 1 from public.weight_records group by athlete_id, date having count(*) > 1) x;
  if v_n > 0 and c_apagar_pesos_repetidos then
    delete from public.weight_records w
    using public.weight_records x
    where x.athlete_id = w.athlete_id
      and x.date = w.date
      and (x.created_at > w.created_at or (x.created_at = w.created_at and x.id::text > w.id::text));
    raise notice 'Pesos repetidos apagados (ficou o último de cada dia) em % dia(s).', v_n;
  elsif v_n > 0 then
    raise notice 'Há % dia(s) com peso repetido (trava desligada: nada apagado).', v_n;
  end if;
  -- Sem repetidos: cria a trava "1 peso por dia" (o índice comum de atleta + data fica sobrando)
  if not exists (select 1 from public.weight_records group by athlete_id, date having count(*) > 1) then
    create unique index if not exists weight_records_um_por_dia on public.weight_records (athlete_id, date);
    drop index if exists public.weight_records_athlete_date_idx;
  end if;
end $$;

notify pgrst, 'reload schema';
