-- ============================================================
-- CONFERIR ISOLAMENTO DOS ADVERSÁRIOS ENTRE CLUBES (só leitura, não altera nada)
-- Rode DEPOIS do supabase_completo.sql: SQL Editor -> cole -> Run.
-- Resultado esperado: todas as linhas com "ok".
-- ============================================================
select item, situacao, detalhe
from (
  -- 1. Só as regras de acesso do sistema (regras extras criadas pelo painel podem abrir os dados)
  select 1 as ordem,
         'Regras de acesso das tabelas de adversários' as item,
         case when count(*) filter (where policyname not in (
                'Clube: leitura', 'Clube: inclusão', 'Clube: alteração', 'Clube: exclusão', 'Adversários: autor da ficha',
                'Observações: leitura do clube', 'Observações: treinador escreve', 'Observações: autor apaga',
                'Ocultos: treinador vê os próprios')) = 0
              then 'ok' else 'ATENÇÃO' end as situacao,
         coalesce(string_agg(tablename || ': ' || policyname, '; ') filter (where policyname not in (
                'Clube: leitura', 'Clube: inclusão', 'Clube: alteração', 'Clube: exclusão', 'Adversários: autor da ficha',
                'Observações: leitura do clube', 'Observações: treinador escreve', 'Observações: autor apaga',
                'Ocultos: treinador vê os próprios')), 'nenhuma regra extra') as detalhe
  from pg_policies
  where schemaname = 'public' and tablename in ('adversarios', 'adversario_observacoes', 'adversario_ocultos')

  union all
  -- 2. Acesso sem login (anônimo) às tabelas
  select 2, 'Acesso sem login às tabelas',
         case when bool_or(has_table_privilege('anon', 'public.' || t, 'select')) then 'ATENÇÃO' else 'ok' end,
         coalesce(string_agg(t, ', ') filter (where has_table_privilege('anon', 'public.' || t, 'select')), 'bloqueado')
  from unnest(array['adversarios', 'adversario_observacoes', 'adversario_ocultos']) t

  union all
  -- 3. Fichas no clube de quem cadastrou
  select 3, 'Fichas fora do clube de quem cadastrou',
         case when count(*) = 0 then 'ok' else 'ATENÇÃO' end,
         count(*) || ' ficha(s)' || coalesce(': ' || string_agg(a.nome, ', '), '')
  from public.adversarios a
  left join public.coaches c on a.criado_por_tipo = 'tecnico' and c.user_id::text = a.criado_por_id::text
  left join public.athletes t on a.criado_por_tipo = 'atleta' and t.id::text = a.criado_por_id::text
  where a.club_id <> coalesce(c.club_id, t.club_id, a.club_id)

  union all
  -- 4. Observações escritas por gente de outro clube (ficam escondidas, mas é bom saber)
  select 4, 'Observações de autores de outro clube (escondidas)',
         case when count(*) = 0 then 'ok' else 'escondidas' end,
         count(*) || ' observação(ões)'
  from public.adversario_observacoes o
  join public.adversarios a on a.id = o.adversario_id
  where public._autor_de_outro_clube(o.autor_tipo, o.autor_id::text, a.club_id)

  union all
  -- 5. Quantas fichas cada clube tem
  select 5, 'Fichas por clube', 'info',
         coalesce(string_agg(nome || ': ' || n, '; '), 'nenhuma')
  from (
    select k.nome, count(a.id) as n
    from public.clubs k left join public.adversarios a on a.club_id = k.id
    group by k.nome order by k.nome
  ) x
) r
order by ordem;
