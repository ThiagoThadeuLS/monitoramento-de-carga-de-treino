-- ============================================================
-- DIAGNÓSTICO DO BANCO (SÓ LEITURA: não altera nem apaga nada)
--
-- Como usar: no Supabase -> SQL Editor, rode UM BLOCO POR VEZ
-- (copie o bloco para uma query nova, ou selecione o bloco e rode só a seleção).
-- O editor mostra só o resultado da última consulta, por isso os blocos são separados.
-- Copie o resultado de cada bloco (como JSON, igual você já fez antes) e mande.
--
-- O bloco 7 cria uma função TEMPORÁRIA (pg_temp), que some sozinha ao terminar:
-- ela só serve para uma verificação com erro não derrubar as outras.
--
-- IMPORTANTE: o editor mostra só 100 linhas por padrão. Antes de rodar, troque o limite
-- de resultados (ao lado do botão Run) para "No limit". E mande cada bloco numa mensagem
-- separada: o chat corta mensagens muito grandes.
-- ============================================================


-- ============================================================
-- BLOCO 1. TABELAS: colunas, regras de acesso (RLS), tamanho e uso
-- ============================================================
select c.relname as tabela,
       case c.relkind when 'r' then 'tabela' when 'p' then 'tabela particionada' when 'v' then 'view'
                      when 'm' then 'view materializada' when 'f' then 'externa' end as tipo,
       c.relrowsecurity as rls_ativo,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
       coalesce(s.n_live_tup, 0) as linhas,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho,
       coalesce(s.seq_scan, 0) as leituras_completas,
       coalesce(s.idx_scan, 0) as leituras_por_indice,
       (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                 || case when a.attnotnull then ' not null' else '' end
                 || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''), ' | ' order by a.attnum)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as colunas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by c.relname;


-- ============================================================
-- BLOCO 2. CHAVES E RESTRIÇÕES (chave primária, estrangeira, único, verificação)
-- ============================================================
select conrelid::regclass::text as tabela,
       case contype when 'p' then 'chave primária' when 'f' then 'chave estrangeira' when 'u' then 'único'
                    when 'c' then 'verificação' when 'x' then 'exclusão' else contype::text end as tipo,
       conname as nome,
       pg_get_constraintdef(oid) as definicao
from pg_constraint
where connamespace = 'public'::regnamespace and conrelid <> 0
order by 1, 2, 3;


-- ============================================================
-- BLOCO 3. ÍNDICES (definição, tamanho e quantas vezes foram usados)
-- ============================================================
select t.relname as tabela,
       i.relname as indice,
       pg_get_indexdef(x.indexrelid) as definicao,
       pg_size_pretty(pg_relation_size(x.indexrelid)) as tamanho,
       coalesce(s.idx_scan, 0) as usos,
       x.indisvalid as valido
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
left join pg_stat_user_indexes s on s.indexrelid = x.indexrelid
where n.nspname = 'public'
order by 1, 2;


-- ============================================================
-- BLOCO 4. REGRAS DE ACESSO (políticas RLS) das tabelas e dos arquivos (storage)
-- ============================================================
select schemaname as esquema,
       tablename as tabela,
       policyname as politica,
       permissive as tipo,
       cmd as operacao,
       array_to_string(roles, ',') as papeis,
       qual as condicao_leitura,
       with_check as condicao_escrita
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2, 3;


-- ============================================================
-- BLOCO 5. FUNÇÕES (segurança, quem pode chamar e uma assinatura do código
--          para comparar com o supabase_completo.sql)
-- ============================================================
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as parametros,
       pg_get_function_result(p.oid) as retorno,
       l.lanname as linguagem,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') as configuracao,
       has_function_privilege('anon', p.oid, 'execute') as sem_login_executa,
       has_function_privilege('authenticated', p.oid, 'execute') as logado_executa,
       md5(replace(p.prosrc, chr(13), '')) as assinatura_codigo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.prokind in ('f', 'p')
  -- funções que vieram de extensões não entram
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1, 2;


-- ============================================================
-- BLOCO 6. GATILHOS, EXTENSÕES, BUCKETS, REALTIME E PERMISSÕES DAS TABELAS
-- ============================================================
select 'gatilho' as tipo,
       tc.relnamespace::regnamespace::text || '.' || tc.relname as alvo,
       tg.tgname as nome,
       pg_get_triggerdef(tg.oid) as detalhe
from pg_trigger tg
join pg_class tc on tc.oid = tg.tgrelid
where not tg.tgisinternal and tc.relnamespace::regnamespace::text in ('public', 'auth')
union all
select 'extensão', n.nspname, e.extname, e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
union all
select 'bucket', 'storage', b.id,
       'público=' || b.public || ' limite=' || coalesce(pg_size_pretty(b.file_size_limit), 'sem limite')
       || ' tipos=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'todos')
from storage.buckets b
union all
select 'realtime', schemaname, tablename, 'tabela publicada no realtime'
from pg_publication_tables
where pubname = 'supabase_realtime'
union all
select 'permissão', table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by 1, 2, 3;


-- ============================================================
-- BLOCO 7. SAÚDE E CONSISTÊNCIA DOS DADOS
-- (cada linha é uma verificação; "erro: ..." costuma indicar parte do arquivo não aplicada)
-- ============================================================
create or replace function pg_temp.diag(p_sql text)
returns text
language plpgsql
as $f$
declare
  v text;
begin
  execute p_sql into v;
  return coalesce(v, '—');
exception when others then
  return 'erro: ' || sqlerrm;
end
$f$;

select ordem, item, pg_temp.diag(consulta) as resultado
from (values
  -- Geral
  (1,  'Versão do Postgres', $q$select version()$q$),
  (2,  'Tamanho do banco', $q$select pg_size_pretty(pg_database_size(current_database()))$q$),
  (3,  'Estatísticas de uso contadas desde', $q$select stats_reset::text from pg_stat_database where datname = current_database()$q$),
  (4,  'Conexões abertas agora', $q$select count(*) from pg_stat_activity$q$),

  -- Atletas e acesso
  (10, 'Atletas ativos', $q$select count(*) from public.athletes where active$q$),
  (11, 'Atletas ativos que nunca entraram (senha inicial = nome)', $q$select count(*) from public.athletes a where a.active and not exists (select 1 from public.athlete_credentials c where c.athlete_id = a.id)$q$),
  (12, 'Atletas ativos que aceitaram o termo', $q$select count(*) from public.athletes where active and terms_accepted_at is not null$q$),
  (13, 'Atletas sem clube', $q$select count(*) from public.athletes where club_id is null$q$),
  (14, 'Atletas com CPF repetido', $q$select count(*) from (select cpf from public.athletes where cpf is not null group by cpf having count(*) > 1) x$q$),
  (15, 'Atletas sem CPF', $q$select count(*) from public.athletes where cpf is null or cpf = ''$q$),
  (17, 'Login de atleta: tentativas erradas nas últimas 24h / CPFs bloqueados agora / redes bloqueadas agora', $q$select count(*) filter (where not success and at > now() - interval '1 day') || ' / ' || (select count(*) from (select cpf from public.athlete_login_attempts where not success and at > now() - interval '15 minutes' group by cpf having count(*) >= 5) x) || ' / ' || (select count(*) from (select ip from public.athlete_login_attempts where not success and ip is not null and at > now() - interval '15 minutes' group by ip having count(*) filter (where not cpf_cadastrado) >= 20 or count(*) >= 100) y) from public.athlete_login_attempts$q$),
  (16, 'Sessões de atleta válidas / vencidas guardadas', $q$select count(*) filter (where expires_at >= now()) || ' / ' || count(*) filter (where expires_at < now()) from public.athlete_sessions$q$),

  -- Respostas
  (20, 'PSE / PSR / peso (total)', $q$select (select count(*) from public.pse_records) || ' / ' || (select count(*) from public.psr_records) || ' / ' || (select count(*) from public.weight_records)$q$),
  (21, 'Respostas sem clube (PSE+PSR+peso)', $q$select (select count(*) from public.pse_records where club_id is null) + (select count(*) from public.psr_records where club_id is null) + (select count(*) from public.weight_records where club_id is null)$q$),
  (22, 'Respostas com clube diferente do atleta', $q$select (select count(*) from public.pse_records r join public.athletes a on a.id = r.athlete_id where r.club_id is distinct from a.club_id) + (select count(*) from public.psr_records r join public.athletes a on a.id = r.athlete_id where r.club_id is distinct from a.club_id) + (select count(*) from public.weight_records r join public.athletes a on a.id = r.athlete_id where r.club_id is distinct from a.club_id)$q$),
  (23, 'PSR repetida no mesmo dia (atleta+dia)', $q$select count(*) from (select 1 from public.psr_records group by athlete_id, date having count(*) > 1) x$q$),
  (24, 'Peso repetido no mesmo dia (atleta+dia)', $q$select count(*) from (select 1 from public.weight_records group by athlete_id, date having count(*) > 1) x$q$),
  (25, 'Trava "1 PSR e 1 peso por dia" criada no banco', $q$select (to_regclass('public.psr_records_um_por_dia') is not null) || ' / ' || (to_regclass('public.weight_records_um_por_dia') is not null)$q$),
  (26, 'Respostas com data no futuro', $q$select (select count(*) from public.pse_records where date > public.training_today()) + (select count(*) from public.psr_records where date > public.training_today()) + (select count(*) from public.weight_records where date > public.training_today())$q$),

  -- Clube e equipe
  (30, 'Clubes (ativos / suspensos)', $q$select count(*) filter (where status = 'ativo') || ' / ' || count(*) filter (where status <> 'ativo') from public.clubs$q$),
  (31, 'Treinadores por papel', $q$select string_agg(role || '=' || n, ', ') from (select role, count(*) n from public.coaches group by role) x$q$),
  (32, 'Treinadores inativos', $q$select count(*) from public.coaches where not active$q$),
  (33, 'Donos da plataforma (conta e e-mail confirmado)', $q$select string_agg(o.email || case when u.id is null then ' (sem conta)' when u.email_confirmed_at is null then ' (e-mail NÃO confirmado)' else ' (ok)' end, ', ') from public.platform_owners o left join auth.users u on lower(u.email) = o.email$q$),
  (34, 'Contas de login que não são treinador nem dono', $q$select count(*) || coalesce(' -> ' || string_agg(u.email, ', '), '') from auth.users u where not exists (select 1 from public.coaches c where c.user_id = u.id) and not exists (select 1 from public.platform_owners o where o.email = lower(u.email))$q$),
  (35, 'Contas de login com e-mail não confirmado', $q$select count(*) from auth.users where email_confirmed_at is null$q$),
  (36, 'Convites pendentes já vencidos', $q$select count(*) from public.coach_invites where used_at is null and canceled_at is null and expires_at < now()$q$),
  (37, 'Modo suporte ativo agora', $q$select count(*) from public.owner_support_sessions where expires_at > now()$q$),
  (38, 'Registro de acessos da Área Restrita (linhas)', $q$select count(*) from public.owner_access_log$q$),

  -- Cronograma, preparação física e outros módulos
  (40, 'Treinos (total / sem clube)', $q$select count(*) || ' / ' || count(*) filter (where club_id is null) from public.training_sessions$q$),
  (41, 'Fichas físicas e PRs sem clube (guardados, mas ninguém vê)', $q$select (select count(*) from public.workout_prescriptions where club_id is null) || ' / ' || (select count(*) from public.athlete_prs where club_id is null)$q$),
  (42, 'Catálogo de exercícios sem clube', $q$select count(*) from public.club_exercises where club_id is null$q$),
  (43, 'Participantes de grupo de outro clube', $q$select count(*) from public.athlete_group_members m join public.athlete_groups g on g.id = m.group_id join public.athletes a on a.id = m.athlete_id where g.club_id is distinct from a.club_id$q$),
  (44, 'Adversários (fichas / observações)', $q$select (select count(*) from public.adversarios) || ' / ' || (select count(*) from public.adversario_observacoes)$q$),
  (45, 'Competições', $q$select count(*) from public.competitions$q$),

  -- Lembretes e agendamento
  (50, 'Aparelhos de lembrete (total / ativos / expirados)', $q$select count(*) || ' / ' || count(*) filter (where expired_at is null) || ' / ' || count(*) filter (where expired_at is not null) from public.push_subscriptions$q$),
  (51, 'Registro de lembretes enviados (linhas)', $q$select count(*) from public.reminder_log$q$),
  (52, 'Agendamentos (pg_cron)', $q$select string_agg(jobname || ' [' || schedule || '] ativo=' || active, ', ') from cron.job$q$),
  (53, 'Execuções do agendamento guardadas (cron.job_run_details)', $q$select count(*) || ' linhas, ' || pg_size_pretty(pg_total_relation_size('cron.job_run_details')) from cron.job_run_details$q$),
  (54, 'Falhas do agendamento nos últimos 7 dias', $q$select count(*) from cron.job_run_details where start_time > now() - interval '7 days' and status <> 'succeeded'$q$),
  (55, 'Respostas da função de lembretes com erro (guardadas)', $q$select count(*) filter (where status_code is distinct from 200) || ' de ' || count(*) from net._http_response$q$),

  -- O banco está com a versão mais nova do arquivo?
  (60, 'Parte 13 aplicada (tela Hoje: athlete_home)', $q$select to_regprocedure('public.athlete_home(uuid)') is not null$q$),
  (61, 'Parte de notificações aplicada (coach_push_status)', $q$select to_regprocedure('public.coach_push_status()') is not null$q$),
  (62, 'Coluna expired_at nos aparelhos de lembrete', $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'expired_at')$q$),
  (63, 'Coluna usa_barra no catálogo de exercícios', $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_exercises' and column_name = 'usa_barra')$q$),
  (64, 'Índices de desempenho da parte 13 (de 5)', $q$select count(*) from pg_indexes where schemaname = 'public' and indexname in ('pse_records_club_date_idx', 'pse_records_athlete_date_idx', 'psr_records_club_date_idx', 'weight_records_club_date_idx', 'training_sessions_club_date_idx')$q$),
  (65, 'Funções com mais de uma versão (parâmetros diferentes)', $q$select string_agg(proname || ' (' || n || ')', ', ') from (select p.proname, count(*) n from pg_proc p where p.pronamespace = 'public'::regnamespace group by p.proname having count(*) > 1) x$q$),
  (66, 'Tabelas de dados SEM regra de acesso ligada (RLS)', $q$select coalesce(string_agg(c.relname, ', '), 'nenhuma') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity$q$),

  -- Limpeza do banco (linhas mortas: o Postgres limpa sozinho; muitas = engasgo)
  (70, 'Tabelas com mais linhas mortas', $q$select string_agg(relname || '=' || n_dead_tup, ', ') from (select relname, n_dead_tup from pg_stat_user_tables where schemaname = 'public' order by n_dead_tup desc limit 5) x$q$),
  (71, 'Tabelas mais lidas por inteiro (sem índice)', $q$select string_agg(relname || '=' || seq_tup_read, ', ') from (select relname, seq_tup_read from pg_stat_user_tables where schemaname = 'public' order by seq_tup_read desc limit 6) x$q$)
) as v(ordem, item, consulta)
order by ordem;


-- ============================================================
-- BLOCO 8. CONSULTAS MAIS PESADAS (onde o banco "engasga")
-- Se der erro, a extensão pg_stat_statements não está ligada: só avise.
-- ============================================================
select round(total_exec_time::numeric) as tempo_total_ms,
       calls as chamadas,
       round(mean_exec_time::numeric, 1) as media_ms,
       round(max_exec_time::numeric) as pior_ms,
       rows as linhas,
       left(regexp_replace(query, '\s+', ' ', 'g'), 220) as consulta
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc
limit 25;


-- ============================================================
-- BLOCO 9. SOBRAS: colunas e tabelas antigas têm dados? Dados fora das regras?
-- (diz se dá para remover as sobras e ligar as regras que faltam sem mexer em nada)
-- ============================================================
select 'athletes.photo_url preenchido' as item, count(*) filter (where photo_url is not null)::text as resultado from public.athletes
union all
select 'coaches.photo_url preenchido', count(*) filter (where photo_url is not null)::text from public.coaches
union all
select 'Fichas fora das regras (séries fora de 1 a 50 ou % do PR fora de 1 a 150)',
       count(*) filter (where series not between 1 and 50 or (porcentagem_pr is not null and porcentagem_pr not between 1 and 150))::text
from public.workout_prescriptions
union all
select 'PRs fora das regras (até 0 ou acima de 500 kg)', count(*) filter (where peso_pr <= 0 or peso_pr > 500)::text from public.athlete_prs
union all
select 'Catálogo fora das regras (nome vazio ou com mais de 80 letras)', count(*) filter (where length(trim(nome)) not between 1 and 80)::text from public.club_exercises
union all
select 'Catálogo com "exige PR" vazio', count(*) filter (where exige_pr is null)::text from public.club_exercises;
