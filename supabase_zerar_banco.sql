-- ============================================================
-- ZERAR O BANCO PARA O PILOTO EM PRODUÇÃO
-- ATENÇÃO: APAGA TODOS OS DADOS. NÃO TEM COMO DESFAZER.
--
-- Fica:
--   * todas as tabelas, funções, regras de acesso, agendamentos (pg_cron) e os buckets de escudos e fotos;
--   * os owners da plataforma (tabela platform_owners) e as contas de login deles;
--   * o registro de acessos da Área Restrita (owner_access_log). Para zerar também, mude a
--     segunda linha da trava para true.
-- Sai:
--   * clubes (com cores e horários de lembrete), treinadores e as contas de login deles, convites;
--   * atletas, senhas e sessões dos atletas, termos aceitos;
--   * PSE, PSR, peso, cronograma, grupos e adversários;
--   * aparelhos cadastrados para lembretes e o controle de envios;
--   * e qualquer outra tabela do schema public.
--
-- Como usar: Supabase -> SQL Editor -> New query -> cole este arquivo inteiro ->
--            troque 'NAO' por 'SIM' na linha da TRAVA (logo abaixo) -> Run.
--            Roda tudo ou nada. No fim aparece cada tabela com a quantidade de linhas.
--
-- Use UMA vez, antes de começar o piloto. Com o piloto rodando, este arquivo apaga os dados reais.
-- ============================================================

do $$
declare
  -- >>> TRAVA: troque 'NAO' por 'SIM' para liberar a limpeza <<<
  v_confirmo constant text := 'NAO';
  -- true = zera também o registro de acessos da Área Restrita
  v_zerar_registro_acessos constant boolean := false;

  -- tabelas do schema public que ficam como estão (dados dos owners)
  v_manter constant text[] := array['platform_owners', 'owner_access_log'];

  v_owners integer;
  v_tabelas text[];
  v_falhas text[];
  t text;
begin
  if v_confirmo is distinct from 'SIM' then
    raise exception 'Trava de segurança ligada: nada foi apagado. Troque ''NAO'' por ''SIM'' na linha da TRAVA e rode de novo.';
  end if;

  -- Precisa sobrar pelo menos uma conta de owner para entrar na Área Restrita depois
  select count(*) into v_owners
  from auth.users u
  join public.platform_owners o on o.email = lower(u.email);
  if v_owners = 0 then
    raise exception 'Nenhuma conta de login de owner encontrada (confira os e-mails da tabela platform_owners). Nada foi apagado.';
  end if;

  -- 1. Esvazia todas as tabelas do schema public, menos as dos owners (tabelas de
  --    extensões também ficam). Se uma tabela depende de outra que ainda tem
  --    linhas, ela é tentada de novo na rodada seguinte.
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v_tabelas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and c.relname <> all (v_manter)
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    );

  loop
    v_falhas := '{}';
    foreach t in array v_tabelas loop
      begin
        execute format('delete from public.%I', t);
      exception when foreign_key_violation then
        v_falhas := v_falhas || t;
      end;
    end loop;
    exit when cardinality(v_falhas) = 0;
    if cardinality(v_falhas) = cardinality(v_tabelas) then
      raise exception 'Não deu para esvaziar: % (ligadas a tabelas que ficam). Nada foi apagado.', array_to_string(v_falhas, ', ');
    end if;
    v_tabelas := v_falhas;
  end loop;

  if v_zerar_registro_acessos then
    delete from public.owner_access_log;
  end if;

  -- 2. Contas de login: ficam só as dos owners
  delete from auth.users u
  where not exists (select 1 from public.platform_owners o where o.email = lower(u.email));
end $$;


-- ------------------------------------------------------------
-- Conferência: tudo com 0 linhas, menos o que é dos owners
-- ------------------------------------------------------------
create or replace function pg_temp.linhas(p_tabela text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I', p_tabela) into n;
  return n;
end;
$$;

select tabela, linhas, situacao
from (
  select 1 as ordem,
         c.relname::text as tabela,
         pg_temp.linhas(c.relname::text) as linhas,
         case
           when c.relname::text in ('platform_owners', 'owner_access_log') then 'mantida (owners)'
           when pg_temp.linhas(c.relname::text) = 0 then 'zerada'
           else 'ATENÇÃO: ainda tem linhas'
         end as situacao
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    )
  union all
  select 2, 'auth.users (contas de login)', count(*),
         'ficaram: ' || coalesce(string_agg(lower(u.email), ', ' order by lower(u.email)), 'nenhuma')
  from auth.users u
  union all
  select 3, 'storage: arquivos (escudos e fotos)', count(*),
         case when count(*) = 0 then 'vazio' else 'apague pelo painel: Storage -> escudos e fotos' end
  from storage.objects o
  where o.bucket_id in ('escudos', 'fotos')
) x
order by ordem, tabela;
