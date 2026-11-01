-- ============================================================
-- DADOS FICTÍCIOS PARA TESTE: 50 ATLETAS + PSE + PSR (BEM-ESTAR)
-- Como aplicar: Supabase -> SQL Editor -> New query -> cole este arquivo -> Run.
-- Rode depois de supabase_completo.sql.
--
-- Baseado na programação real de 19/10 a 31/10/2026 (20 treinos, exportada
-- do cronograma). Os treinos estão escritos aqui dentro, então o resultado é o
-- mesmo mesmo depois que a limpeza automática apagar a semana de 19 a 25/10.
--
-- O que faz:
--  1. Cria 50 atletas fictícios (CPF válido, marcados com celular "FICTICIO").
--  2. Para cada um dos 20 treinos, cada atleta responde a PSE (~94% respondem),
--     perto da PSE esperada do treino. Treinos que ainda não começaram ficam de fora.
--  3. Todo dia de 19/10 a 31/10 cada atleta responde a PSR (~92% respondem),
--     pior depois de dias de carga alta.
--
-- Rodar de novo: apaga os dados fictícios anteriores e gera tudo outra vez.
-- Para APAGAR tudo que é fictício, rode só o bloco "LIMPEZA" no fim do arquivo.
-- Não altera o cronograma nem atletas reais.
-- ============================================================

-- Limpa a rodada anterior (respostas somem junto, por cascade)
delete from public.athletes where celular = 'FICTICIO';

select setseed(0.42); -- mesmos números a cada execução

-- ------------------------------------------------------------
-- 1. Atletas fictícios
-- ------------------------------------------------------------
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

-- Atletas do Minas Tênis Clube (clube criado em supabase_completo.sql)
insert into public.athletes (nome, cpf, classe, categoria, celular, sexo, active, club_id)
select
  nomes.primeiro || ' ' || sobrenomes.ultimo || ' ' || sobrenomes2.ultimo,
  pg_temp.cpf_valido(731000000 + n * 7919),
  (array['Sênior', 'Junior', 'Juvenil'])[1 + n % 3],
  case when n % 2 = 0
    then (array['-60', '-66', '-73', '-81', '-90', '-100', '+100'])[1 + n % 7]
    else (array['-48', '-52', '-57', '-63', '-70', '-78', '+78'])[1 + n % 7]
  end,
  'FICTICIO',
  case when n % 2 = 0 then 'Masculino' else 'Feminino' end,
  true,
  '00000000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 50) as n
cross join lateral (
  select case when n % 2 = 0
    then (array['Gabriel','Lucas','Pedro','Rafael','Mateus','Bruno','Thiago','Felipe','Gustavo','Daniel','Leonardo','Vinícius','Caio','André','Diego'])[1 + (n / 2) % 15]
    else (array['Mariana','Beatriz','Larissa','Ana','Júlia','Camila','Fernanda','Letícia','Isabela','Carolina','Amanda','Bianca','Natália','Priscila','Renata'])[1 + (n / 2) % 15]
  end as primeiro
) nomes
cross join lateral (
  select (array['Silva','Santos','Oliveira','Souza','Costa','Pereira','Almeida','Ferreira','Rodrigues','Lima','Gomes','Martins','Araújo','Ribeiro','Carvalho'])[1 + (n * 7) % 15] as ultimo
) sobrenomes
cross join lateral (
  select (array['Rocha','Mendes','Barbosa','Teixeira','Moura','Cardoso','Nunes','Freitas','Pinto','Duarte'])[1 + (n * 3) % 10] as ultimo
) sobrenomes2;

-- ------------------------------------------------------------
-- 2. Programação de 19/10 a 31/10/2026 (copiada do cronograma)
-- ------------------------------------------------------------
drop table if exists pg_temp.programacao;
create temporary table programacao (
  date date, start_time time, end_time time, name text, training_type text, expected_pse int
);

insert into programacao values
  ('2026-10-19', '08:00', '10:30', 'Treino força máxima',    'Treino Físico',  5),
  ('2026-10-19', '14:00', '16:00', 'Treino Tatiwaza',        'Treino Randori', 6),
  ('2026-10-20', '08:00', '10:00', 'Treino técnico',         'Treino Técnico', 4),
  ('2026-10-20', '14:00', '16:00', 'Treino híbrido',         'Treino Randori', 6),
  ('2026-10-21', '08:00', '10:30', 'Treino potência',        'Treino Físico',  6),
  ('2026-10-22', '08:00', '10:30', 'Treino técnico',         'Treino Técnico', 4),
  ('2026-10-22', '14:00', '16:00', 'Treino newaza',          'Treino Randori', 6),
  ('2026-10-23', '08:00', '10:30', 'Treino velocidade',      'Treino Físico',  6),
  ('2026-10-23', '14:00', '16:00', 'Treino híbrido',         'Treino Randori', 6),
  ('2026-10-24', '09:00', '11:00', 'Treino híbrido',         'Treino Randori', 6),
  ('2026-10-26', '08:00', '10:30', 'Treino de força máxima', 'Treino Físico',  5),
  ('2026-10-26', '14:00', '16:00', 'Treino newaza',          'Treino Randori', 5),
  ('2026-10-27', '08:00', '10:00', 'Treino técnico',         'Treino Técnico', 4),
  ('2026-10-27', '14:00', '16:00', 'Treino tatiwaza',        'Treino Randori', 6),
  ('2026-10-28', '08:00', '10:30', 'Treino força máxima',    'Treino Físico',  6),
  ('2026-10-29', '08:00', '10:00', 'Treino técnico',         'Treino Técnico', 4),
  ('2026-10-29', '14:00', '16:00', 'Treino tatiwaza',        'Treino Randori', 6),
  ('2026-10-30', '08:00', '10:30', 'Treino potência baixa',  'Treino Físico',  5),
  ('2026-10-30', '14:00', '16:00', 'Treino newaza',          'Treino Randori', 4),
  ('2026-10-31', '09:00', '11:00', 'Treino híbrido',         'Treino Randori', 8);

-- ------------------------------------------------------------
-- 3. PSE: uma resposta por atleta para cada treino já realizado
--    (treinos que ainda não começaram ficam de fora)
-- ------------------------------------------------------------
with atletas as (
  select id,
         -- cada atleta tem um "jeito" de responder: uns sempre acima, outros abaixo
         (random() * 2 - 1) * 1.2 as vies
  from public.athletes where celular = 'FICTICIO'
),
treinos as (
  select s.*
  from programacao s
  where ((s.date + s.start_time) at time zone 'America/Sao_Paulo') <= now()
),
respostas as (
  select
    a.id as athlete_id,
    t.date,
    t.training_type,
    t.expected_pse,
    coalesce(t.end_time, t.start_time + interval '90 minutes') as fim,
    a.vies,
    random() as sorteio,
    -- ruído ~ normal (soma de 3 uniformes): a maioria fica a ±1 da esperada
    (random() + random() + random() - 1.5) * 1.6 as ruido
  from treinos t
  cross join atletas a
)
insert into public.pse_records (athlete_id, date, training_type, rpe_score, did_not_train, observations, created_at)
select
  athlete_id,
  date,
  case when sorteio < 0.04 then null else training_type end,
  case when sorteio < 0.04 then null
       else greatest(1, least(10, round(expected_pse + vies + ruido)::int)) end,
  sorteio < 0.04,                                   -- ~4% não treinaram (lesão, viagem...)
  case
    when sorteio < 0.04 then (array['Lesão no ombro', 'Viagem', 'Doente', 'Dispensado pelo treinador'])[1 + floor(random() * 4)::int]
    when random() < 0.06 then (array['Muito cansado', 'Treino pesado', 'Dor no joelho', 'Senti bem', 'Pouco sono'])[1 + floor(random() * 5)::int]
  end,
  -- respondem entre 5 e 40 min depois do fim do treino (horário de Brasília), nunca no futuro
  least(now(), ((date + fim) at time zone 'America/Sao_Paulo') + make_interval(mins => 5 + floor(random() * 35)::int))
from respostas
where sorteio < 0.94;                               -- ~6% esquecem de responder

-- ------------------------------------------------------------
-- 4. PSR (bem-estar): uma por atleta por dia, de manhã
--    De 19/10 a 31/10 (ou até hoje). Fica pior no dia seguinte a treinos pesados.
-- ------------------------------------------------------------
with atletas as (
  select id, (random() * 2 - 1) * 1.0 as vies
  from public.athletes where celular = 'FICTICIO'
),
dias as (
  select d::date as date
  from generate_series(
    date '2026-10-19',
    least(date '2026-10-31', (now() at time zone 'America/Sao_Paulo')::date),
    interval '1 day'
  ) as d
),
carga_ontem as (
  -- média da PSE de cada atleta no dia anterior (0 se não treinou)
  select a.id as athlete_id, dd.date,
         coalesce(avg(p.rpe_score), 0) as pse_ontem
  from atletas a
  cross join dias dd
  left join public.pse_records p
    on p.athlete_id = a.id and p.date = dd.date - 1 and not p.did_not_train
  group by a.id, dd.date
),
base as (
  select c.athlete_id, c.date, a.vies,
         -- recuperação cai ~0,5 ponto por ponto de PSE acima de 5 no dia anterior
         7.5 + a.vies - greatest(0, c.pse_ontem - 5) * 0.5 as nivel,
         random() as sorteio
  from carga_ontem c
  join atletas a on a.id = c.athlete_id
)
insert into public.psr_records (
  athlete_id, date, psr_score, fatigue_score, sleep_score,
  muscle_soreness_score, stress_score, mood_score, created_at
)
select
  athlete_id,
  date,
  greatest(1, least(10, round(nivel + (random() + random() - 1) * 2.0)::int)),
  greatest(1, least(10, round(nivel - 0.3 + (random() + random() - 1) * 2.2)::int)),
  greatest(1, least(10, round(nivel + 0.2 + (random() + random() - 1) * 2.4)::int)),
  greatest(1, least(10, round(nivel - 0.5 + (random() + random() - 1) * 2.2)::int)),
  greatest(1, least(10, round(nivel + 0.4 + (random() + random() - 1) * 2.0)::int)),
  greatest(1, least(10, round(nivel + 0.5 + (random() + random() - 1) * 1.8)::int)),
  -- respondem entre 06h30 e 09h (Brasília)
  ((date + time '06:30') at time zone 'America/Sao_Paulo') + make_interval(mins => floor(random() * 150)::int)
from base
where sorteio < 0.92                                  -- ~8% esquecem
  -- de hoje só quem já teria respondido (depois das 09h)
  and ((date + time '09:00') at time zone 'America/Sao_Paulo') <= now();

-- Resumo do que foi gerado
select 'atletas fictícios' as item, count(*) as total from public.athletes where celular = 'FICTICIO'
union all
select 'treinos usados', count(*) from programacao where ((date + start_time) at time zone 'America/Sao_Paulo') <= now()
union all
select 'respostas de PSE', count(*) from public.pse_records p
  join public.athletes a on a.id = p.athlete_id where a.celular = 'FICTICIO'
union all
select 'respostas de PSR', count(*) from public.psr_records r
  join public.athletes a on a.id = r.athlete_id where a.celular = 'FICTICIO';


-- ============================================================
-- LIMPEZA (opcional): para apagar TODOS os dados fictícios, rode só isto:
--
--   delete from public.athletes where celular = 'FICTICIO';
--
-- (as respostas de PSE e PSR desses atletas são apagadas junto)
-- ============================================================
