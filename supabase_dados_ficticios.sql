-- ============================================================
-- DADOS FICTÍCIOS COMPLETOS — CLUBE 00000000-0000-4000-8000-000000000001
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_completo.sql. Só para banco de TESTE (nunca no banco do piloto).
--
-- O que cria (datas relativas ao dia em que for executado):
--  * 36 atletas (18 masculinos e 18 femininos, CPF válido, marcados com celular "FICTICIO").
--    Entram no app com o CPF e a senha inicial = nome completo junto e minúsculo.
--  * 7 grupos (Masculino, Feminino, Sênior, Junior, Juvenil, Seleção, Pesados).
--  * Cronograma da semana passada, atual e próxima (com público e anotações).
--  * 8 semanas de PSE (com duração e carga), PSR e peso (seg/qua/sex).
--  * 12 atletas adversários e o horário de lembretes do clube (se ainda não houver).
--
-- Situações para demonstrar a aba Carga, a ficha e os alertas:
--  * 3 atletas com PICO de carga na última semana (ACWR acima de 1,5).
--  * 2 atletas com semana MONÓTONA (mesma carga todo dia: monotonia acima de 2).
--  * 1 atleta voltando de lesão (semanas de "não treinei" com motivo, depois retorno).
--  * 1 atleta em corte de peso (curva de peso descendo).
--  * 1 atleta que responde pouco (aparece em "Sem resposta").
--  * 1 atleta inativo e 3 com o termo de dados pendente.
--
-- Rodar de novo: apaga os fictícios anteriores e gera tudo outra vez.
-- Não altera atletas, grupos, treinos ou adversários reais.
-- Para APAGAR tudo que é fictício, rode só o bloco "LIMPEZA" no fim do arquivo.
-- ============================================================

select setseed(0.42); -- mesmos números a cada execução

-- CPF válido a partir de 9 dígitos
create or replace function pg_temp.cpf_valido(p_base bigint)
returns text
language plpgsql
immutable
as $$
declare
  d int[] := array[]::int[];
  s int;
  i int;
  base text := lpad((p_base % 1000000000)::text, 9, '0');
begin
  for i in 1..9 loop d := d || substr(base, i, 1)::int; end loop;
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  d := d || case when (s * 10) % 11 = 10 then 0 else (s * 10) % 11 end;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  d := d || case when (s * 10) % 11 = 10 then 0 else (s * 10) % 11 end;
  return array_to_string(d, '');
end;
$$;

-- Identificadores dos registros fictícios começam com f1c71c10 (para limpar depois)
create or replace function pg_temp.fid(p_n bigint)
returns uuid
language sql
immutable
as $$ select ('f1c71c10-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- Semana-modelo de treinos (1 = segunda ... 6 = sábado)
drop table if exists pg_temp.modelo;
create temp table modelo (
  dow int, inicio time, fim time, nome text, tipo text, pse int,
  publico text,           -- todos | selecao | exceto_juvenil
  nota text
);
insert into pg_temp.modelo values
  (1, '07:30', '09:00', 'Físico — força', 'Treino Físico', 6, 'todos', 'Levar elástico e corda. Aquecimento às 7h20.'),
  (1, '17:00', '18:30', 'Técnico — pegada e kumikata', 'Treino Técnico', 5, 'todos', null),
  (2, '17:00', '18:45', 'Randori', 'Treino Randori', 8, 'todos', 'Randori 6 x 5 min, troca de parceiro a cada round.'),
  (3, '07:30', '09:00', 'Físico — potência', 'Treino Físico', 7, 'todos', null),
  (3, '17:00', '18:30', 'Técnico — ne-waza', 'Treino Técnico', 5, 'todos', 'Foco em transição em pé → solo.'),
  (4, '17:00', '18:45', 'Randori', 'Treino Randori', 8, 'todos', null),
  (5, '07:30', '08:30', 'Físico — regenerativo', 'Treino Físico', 4, 'exceto_juvenil', 'Juvenis dispensados (aula).'),
  (5, '17:00', '18:00', 'Técnico — situações de luta', 'Treino Técnico', 6, 'todos', null),
  (6, '09:00', '10:30', 'Randori — seleção', 'Treino Randori', 8, 'selecao', 'Somente atletas da seleção. Pesagem antes do treino.');

do $$
declare
  c_club constant uuid := '00000000-0000-4000-8000-000000000001';
  v_today date := public.training_today();
  v_now time := (now() at time zone 'America/Sao_Paulo')::time;
  v_week date := public.training_week_start(public.training_today());
  v_nomes text[] := array[
    'Gabriel Moura Teixeira', 'Lucas Andrade Pires', 'Pedro Henrique Lacerda', 'Rafael Nogueira Campos', 'Mateus Fonseca Brandão',
    'Bruno Siqueira Lopes', 'Thiago Rezende Matos', 'Felipe Antunes Correia', 'Gustavo Prado Viana', 'Daniel Queiroz Farias',
    'Leonardo Vasconcelos Reis', 'Vinícius Tavares Aguiar', 'Caio Bittencourt Lemos', 'André Figueiredo Sales', 'Diego Pacheco Araújo',
    'Murilo Cavalcanti Rocha', 'Henrique Bastos Monteiro', 'Samuel Guimarães Dias',
    'Mariana Couto Ribeiro', 'Beatriz Lobato Freire', 'Larissa Peixoto Amaral', 'Ana Clara Moreira Lins', 'Júlia Sampaio Neves',
    'Camila Torres Medeiros', 'Fernanda Rangel Duarte', 'Letícia Barros Cunha', 'Isabela Fontes Miranda', 'Carolina Assis Vieira',
    'Amanda Castelo Pimentel', 'Bianca Leal Magalhães', 'Natália Coelho Brito', 'Priscila Godoy Ramos', 'Renata Mattos Franco',
    'Yasmin Carvalho Seixas', 'Giovana Paiva Holanda', 'Lívia Dantas Ventura'];
  v_cat_m text[] := array['-60', '-66', '-73', '-81', '-90', '-100', '+100'];
  v_cat_f text[] := array['-48', '-52', '-57', '-63', '-70', '-78', '+78'];
  v_motivos text[] := array[
    'Consulta médica no horário do treino.', 'Gripe, com febre desde ontem.', 'Prova na faculdade.',
    'Dor no joelho direito, poupado pelo fisioterapeuta.', 'Viagem com a família.', 'Trânsito: não cheguei a tempo.'];
  v_obs text[] := array[
    'Senti o ombro no fim do randori.', 'Treino bom, me senti forte.', 'Cansado da semana.',
    'Pegada melhorou bastante.', 'Dormi mal, rendi menos.', 'Muito calor no tatame.'];
  a record;
  t record;
  d date;
  i int;
  n bigint := 0;
  v_id uuid;
  v_sexo text;
  v_classe text;
  v_cat text;
  v_rpe int;
  v_dur int;
  v_prev numeric;
  v_base numeric;
  v_pen numeric;
  v_peso numeric;
  g_m uuid := pg_temp.fid(100001);
  g_f uuid := pg_temp.fid(100002);
  g_sen uuid := pg_temp.fid(100003);
  g_jun uuid := pg_temp.fid(100004);
  g_juv uuid := pg_temp.fid(100005);
  g_sel uuid := pg_temp.fid(100006);
  g_pes uuid := pg_temp.fid(100007);
  v_gnome text;
begin
  if not exists (select 1 from public.clubs where id = c_club) then
    raise exception 'Clube de teste % não existe neste banco. Os dados fictícios são só para banco de teste: lá o supabase_completo.sql cria esse clube na primeira execução.', c_club;
  end if;

  -- ---------- Limpeza da rodada anterior ----------
  delete from public.training_sessions where club_id = c_club and id::text like 'f1c71c10-%';
  delete from public.athlete_groups where club_id = c_club and id::text like 'f1c71c10-%';
  delete from public.adversarios where club_id = c_club and id::text like 'f1c71c10-%';
  delete from public.athletes where club_id = c_club and celular = 'FICTICIO'; -- respostas vão junto

  -- ---------- Atletas ----------
  drop table if exists pg_temp.fa;
  create temp table fa (
    id uuid, idx int, sexo text, classe text, categoria text,
    perfil text, pse_off numeric, adesao numeric, peso_base numeric, bem numeric
  );
  for i in 1..36 loop
    v_sexo := case when i <= 18 then 'Masculino' else 'Feminino' end;
    v_classe := (array['Sênior', 'Sênior', 'Junior', 'Juvenil'])[1 + (i % 4)];
    v_cat := case when v_sexo = 'Masculino' then v_cat_m[1 + (i % 7)] else v_cat_f[1 + (i % 7)] end;
    v_id := pg_temp.fid(i);
    insert into public.athletes (id, nome, cpf, classe, categoria, celular, sexo, active, club_id, terms_accepted_at, terms_version)
    values (
      v_id, v_nomes[i], pg_temp.cpf_valido(945000000 + i * 7919), v_classe, v_cat, 'FICTICIO', v_sexo,
      i <> 34,                                                            -- 1 inativo
      c_club,
      case when i in (31, 32, 33) then null else now() - interval '50 days' end, -- 3 com termo pendente
      case when i in (31, 32, 33) then null else '2026-11' end
    );
    insert into pg_temp.fa values (
      v_id, i, v_sexo, v_classe, v_cat,
      case when i in (3, 12, 23) then 'pico'
           when i in (7, 27) then 'monotono'
           when i = 16 then 'retorno'
           when i = 20 then 'faltoso'
           when i = 34 then 'inativo'
           when i = 6 then 'corte'
           else 'normal' end,
      round(((random() - 0.5) * 1.6)::numeric, 2),
      case when i = 20 then 0.55 else 0.86 + random() * 0.12 end,
      replace(replace(v_cat, '+', ''), '-', '')::numeric + case when v_cat like '+%' then 9 else -1.5 end + round((random() * 1.2)::numeric, 1),
      6.6 + random() * 1.8
    );
  end loop;

  -- ---------- Grupos ----------
  for t in select * from (values
      (g_m, 'Masculino'), (g_f, 'Feminino'), (g_sen, 'Sênior'), (g_jun, 'Junior (Sub-21)'),
      (g_juv, 'Juvenil (Sub-18)'), (g_sel, 'Seleção — fim de semana'), (g_pes, 'Pesados')) as x(gid, gnome)
  loop
    v_gnome := t.gnome;
    if exists (select 1 from public.athlete_groups g where g.club_id = c_club and lower(trim(g.nome)) = lower(v_gnome)) then
      v_gnome := v_gnome || ' (fictício)'; -- não colide com um grupo real de mesmo nome
    end if;
    insert into public.athlete_groups (id, club_id, nome) values (t.gid, c_club, v_gnome);
  end loop;
  insert into public.athlete_group_members (group_id, athlete_id, club_id)
  select g, fa.id, c_club
  from pg_temp.fa
  cross join lateral (values
    (case when fa.sexo = 'Masculino' then g_m else g_f end),
    (case fa.classe when 'Sênior' then g_sen when 'Junior' then g_jun else g_juv end),
    (case when fa.idx % 4 = 0 or fa.perfil = 'pico' then g_sel end),
    (case when fa.categoria in ('-90', '-100', '+100', '-78', '+78') then g_pes end)
  ) as m(g)
  where g is not null;

  -- ---------- Cronograma: semana passada, atual e próxima ----------
  for d in select generate_series(v_week - 7, v_week + 13, interval '1 day')::date loop
    for t in select * from pg_temp.modelo where dow = extract(isodow from d)::int loop
      n := n + 1;
      insert into public.training_sessions (id, club_id, date, start_time, end_time, name, training_type, expected_pse, notes, audience, target_group_ids)
      values (
        pg_temp.fid(200000 + n), c_club, d, t.inicio, t.fim, t.nome, t.tipo, t.pse, t.nota,
        case t.publico when 'selecao' then 'incluir' when 'exceto_juvenil' then 'exceto' else 'todos' end,
        case t.publico when 'selecao' then array[g_sel] when 'exceto_juvenil' then array[g_juv] else '{}'::uuid[] end
      );
    end loop;
  end loop;

  -- ---------- Respostas: 8 semanas de PSE, PSR e peso ----------
  for a in select * from pg_temp.fa loop
    for d in select generate_series(v_today - 55, case when a.perfil = 'inativo' then v_today - 15 else v_today end, interval '1 day')::date loop

      -- PSE
      if a.perfil = 'monotono' and d > v_today - 7 then
        -- semana monótona: o mesmo treino todo dia, inclusive domingo
        if d < v_today or v_now > time '19:00' then
          insert into public.pse_records (athlete_id, date, training_type, rpe_score, did_not_train, duration_minutes, created_at)
          values (a.id, d, 'Treino Físico', 6, false, 80, ((d + time '19:00') at time zone 'America/Sao_Paulo'));
        end if;
      else
        for t in
          select * from pg_temp.modelo m
          where m.dow = extract(isodow from d)::int
            and (m.publico = 'todos'
                 or (m.publico = 'selecao' and exists (select 1 from public.athlete_group_members gm where gm.group_id = g_sel and gm.athlete_id = a.id))
                 or (m.publico = 'exceto_juvenil' and a.classe <> 'Juvenil'))
          order by m.inicio
        loop
          continue when d = v_today and t.fim + interval '20 minutes' > v_now; -- treino de hoje ainda não acabou
          continue when random() > a.adesao;                                    -- não respondeu

          if a.perfil = 'retorno' and d between v_today - 35 and v_today - 12 then
            insert into public.pse_records (athlete_id, date, did_not_train, observations, created_at)
            values (a.id, d, true, 'Lesão no ombro esquerdo — fisioterapia.', ((d + t.fim + interval '30 minutes') at time zone 'America/Sao_Paulo'));
            exit; -- uma resposta de ausência por dia
          elsif random() < 0.03 then
            insert into public.pse_records (athlete_id, date, did_not_train, observations, created_at)
            values (a.id, d, true, v_motivos[1 + floor(random() * 6)::int], ((d + t.fim + interval '40 minutes') at time zone 'America/Sao_Paulo'));
            exit;
          end if;

          v_rpe := least(10, greatest(1, round(t.pse + a.pse_off + (random() - 0.5) * 2.4
                     + case when a.perfil = 'pico' and d > v_today - 7 then 2 else 0 end)));
          v_dur := extract(epoch from (t.fim - t.inicio))::int / 60 + round((random() - 0.5) * 16)::int;
          -- pico: semanas anteriores mais leves (volta de férias) e a última bem mais longa
          if a.perfil = 'pico' then
            v_dur := round(v_dur * case when d > v_today - 7 then 1.4 when d > v_today - 28 then 0.7 else 1 end);
          end if;
          insert into public.pse_records (athlete_id, date, training_type, rpe_score, did_not_train, duration_minutes, observations, created_at)
          values (
            a.id, d, t.tipo, v_rpe, false, v_dur,
            case when random() < 0.08 then v_obs[1 + floor(random() * 6)::int] end,
            ((d + t.fim + make_interval(mins => 20 + floor(random() * 70)::int)) at time zone 'America/Sao_Paulo')
          );
        end loop;
      end if;

      -- PSR: nos dias de treino (segunda a sábado), de manhã
      if extract(isodow from d) <= 6 and random() <= a.adesao and (d < v_today or v_now > time '08:30') then
        select coalesce(sum(rpe_score * duration_minutes), 0) into v_prev
        from public.pse_records where athlete_id = a.id and date = d - 1 and not did_not_train;
        v_pen := v_prev / 450.0 + case when a.perfil = 'pico' and d > v_today - 7 then 1.8 else 0 end
                 + case when a.perfil = 'monotono' and d > v_today - 7 then 1.0 else 0 end;
        v_base := a.bem - v_pen;
        insert into public.psr_records (athlete_id, date, psr_score, fatigue_score, sleep_score, muscle_soreness_score, stress_score, mood_score, created_at)
        values (
          a.id, d,
          least(10, greatest(1, round(v_base + (random() - 0.5) * 2))),
          least(10, greatest(1, round(v_base - 0.3 + (random() - 0.5) * 2))),
          least(10, greatest(1, round(a.bem + (random() - 0.5) * 3 - case when a.perfil = 'pico' and d > v_today - 7 then 1.5 else 0 end))),
          least(10, greatest(1, round(v_base - 0.5 + (random() - 0.5) * 2 - case when a.perfil = 'retorno' and d between v_today - 35 and v_today - 12 then 2 else 0 end))),
          least(10, greatest(1, round(a.bem + (random() - 0.5) * 2.6))),
          least(10, greatest(1, round(a.bem + 0.4 + (random() - 0.5) * 2))),
          ((d + time '06:40' + make_interval(mins => floor(random() * 100)::int)) at time zone 'America/Sao_Paulo')
        );
      end if;

      -- Peso: segunda, quarta e sexta às 7h
      if extract(isodow from d) in (1, 3, 5) and random() < 0.9 and (d < v_today or v_now > time '07:30') then
        v_peso := a.peso_base + sin((v_today - d) / 5.0) * 0.4 + (random() - 0.5) * 0.4
                  - case when a.perfil = 'corte' and d > v_today - 21 then (21 - (v_today - d)) * 0.13 else 0 end;
        insert into public.weight_records (athlete_id, date, weight, created_at)
        values (a.id, d, round(v_peso::numeric, 1), ((d + time '07:00' + make_interval(mins => floor(random() * 30)::int)) at time zone 'America/Sao_Paulo'));
      end if;
    end loop;
  end loop;

  -- ---------- Adversários ----------
  insert into public.adversarios (id, club_id, nome, categoria_peso, classe_idade, tipo_origem, origem_valor, observacao)
  values
    (pg_temp.fid(300001), c_club, 'Rodrigo Sanches Lira', '-73kg', 'sênior', 'clube', 'Esporte Clube Pinheiros', 'Canhoto. Forte no uchi-mata; entra bem no contra-ataque.'),
    (pg_temp.fid(300002), c_club, 'Kenji Yamamoto', '-66kg', 'sênior', 'pais', 'Japão', 'Muito rápido na troca de pegada. Seoi-nage de joelhos.'),
    (pg_temp.fid(300003), c_club, 'Paulo Henrique Viana', '-81kg', 'júnior', 'clube', 'Sogipa', 'Bom no solo; busca estrangulamento após o ippon-seoi.'),
    (pg_temp.fid(300004), c_club, 'Lucas Ferraz Moreno', '-90kg', 'sênior', 'clube', 'Flamengo', 'Pegada cruzada; cansa no golden score.'),
    (pg_temp.fid(300005), c_club, 'Mehdi Benali', '-100kg', 'sênior', 'pais', 'França', 'Alto, usa muito o ko-uchi-gari. Defende bem o solo.'),
    (pg_temp.fid(300006), c_club, 'Tiago Rangel', '+100kg', 'júnior', 'clube', 'Instituto Reação', 'Pesado e paciente. Explora punições do adversário.'),
    (pg_temp.fid(300007), c_club, 'Aline Prates Moura', '-57kg', 'sênior', 'clube', 'Esporte Clube Pinheiros', 'Destra. Ataca o tempo todo com o-uchi-gari.'),
    (pg_temp.fid(300008), c_club, 'Sofia Kowalska', '-63kg', 'sênior', 'pais', 'Polônia', 'Muito forte fisicamente. Pegada de costas.'),
    (pg_temp.fid(300009), c_club, 'Helena Ribas', '-52kg', 'juvenil', 'clube', 'Sogipa', 'Revelação; perde rendimento após 3 min.'),
    (pg_temp.fid(300010), c_club, 'Marta Quintero', '-70kg', 'sênior', 'pais', 'Colômbia', 'Boa no tai-otoshi. Cuidado com o contra-golpe.'),
    (pg_temp.fid(300011), c_club, 'Bianca Teles', '-78kg', 'júnior', 'clube', 'Flamengo', 'Domina o solo; transição rápida.'),
    (pg_temp.fid(300012), c_club, 'Yuna Park', '+78kg', 'sênior', 'pais', 'Coreia do Sul', 'Experiente. Usa muito o harai-goshi.');

  -- ---------- Horário dos lembretes (só se o clube ainda não configurou) ----------
  insert into public.club_reminder_settings (club_id, weight_days, weight_time, notify_from, notify_until)
  values (c_club, '{1,3,5}', '07:00', '06:00', '21:00')
  on conflict (club_id) do nothing;
end $$;

-- Resumo do que foi criado
select
  (select count(*) from public.athletes where club_id = '00000000-0000-4000-8000-000000000001' and celular = 'FICTICIO') as atletas,
  (select count(*) from public.athlete_groups where id::text like 'f1c71c10-%') as grupos,
  (select count(*) from public.training_sessions where id::text like 'f1c71c10-%') as treinos_no_cronograma,
  (select count(*) from public.pse_records p join public.athletes a on a.id = p.athlete_id where a.celular = 'FICTICIO') as pse,
  (select count(*) from public.psr_records p join public.athletes a on a.id = p.athlete_id where a.celular = 'FICTICIO') as psr,
  (select count(*) from public.weight_records p join public.athletes a on a.id = p.athlete_id where a.celular = 'FICTICIO') as pesagens,
  (select count(*) from public.adversarios where id::text like 'f1c71c10-%') as adversarios;

-- ============================================================
-- LIMPEZA (opcional): para apagar TODOS os dados fictícios, rode só isto:
--
--   delete from public.training_sessions where id::text like 'f1c71c10-%';
--   delete from public.athlete_groups    where id::text like 'f1c71c10-%';
--   delete from public.adversarios       where id::text like 'f1c71c10-%';
--   delete from public.athletes where club_id = '00000000-0000-4000-8000-000000000001' and celular = 'FICTICIO';
--
-- (PSE, PSR, peso e participações em grupos desses atletas são apagados junto)
-- ============================================================
