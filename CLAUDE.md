# Monitoramento de Carga de Treino

Plataforma multi-clube (piloto: judô do Minas Tênis Clube). O atleta registra PSE (esforço de cada treino, com duração), PSR (bem-estar) e peso; a comissão técnica acompanha o elenco, planeja o cronograma e a preparação física. Detalhes do produto: [docs/PRD.md](docs/PRD.md) e [docs/PDD.md](docs/PDD.md).

## Stack

- React 18 + TypeScript + Vite + Tailwind; ícones `lucide-react`.
- Supabase (Postgres + Auth + Storage + Edge Functions `enviar-lembretes` e `foto-atleta`). Deploy na Vercel.
- PWA: `public/sw.js` recebe os lembretes (Web Push). No celular o app só funciona instalado.

## Comandos

```bash
npm run dev         # servidor local (precisa do .env com VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm run build       # tsc + vite build
npm test            # vitest (cálculos em src/lib/*.test.ts)
npm run lint        # eslint (inclui react-hooks/exhaustive-deps)
npm run typecheck
npm run db:migrate  # aplica supabase_completo.sql (ver instruções em scripts/migrate.mjs)
```

Antes de terminar uma mudança: `npm run typecheck && npm run lint && npm test`.

## Banco de dados (um único arquivo)

- **Todo o banco está em [supabase_completo.sql](supabase_completo.sql)**, dividido em partes numeradas. Ele roda inteiro de novo a cada mudança (SQL Editor do Supabase ou `npm run db:migrate`), então tudo precisa ser **idempotente**: `create ... if not exists`, `create or replace function`, `drop policy if exists` antes de `create policy`, colunas novas com `add column if not exists`.
- Uma função redefinida mais adiante no arquivo substitui a anterior, mas **o arquivo roda em ordem**: se uma parte chama a função logo depois de criá-la, a versão daquela parte é a que executa. Mude a função em todas as partes onde ela aparece.
- Nas políticas (RLS), chame as funções dentro de `(select ...)`: `club_id = (select public.current_club_id())`. Assim o banco calcula uma vez por consulta, e não linha por linha.
- Funções `security definer` sempre com `set search_path = ''` e nomes qualificados (`public.`, `extensions.`). Depois de criar, `revoke ... from public, anon` e `grant` só para quem precisa.
- **O script não apaga dados**: nada de `delete`/`truncate` soltos no arquivo nem limpeza automática (o cronograma guarda todos os treinos). Para criar uma regra nova (ex.: índice único), confira antes se os dados antigos já cumprem a regra e, se não cumprirem, só avise (`raise notice`).
- `supabase_dados_ficticios.sql` = dados de teste (clube "Desenvolvimento"). O antigo `supabase_zerar_banco.sql` foi removido depois do início do piloto (está no histórico do git).
- `supabase_diagnostico.sql` = consultas só de leitura para conferir o banco (estrutura, regras de acesso, funções, saúde). Rode um bloco por vez.
- `supabase_limpeza.sql` = limpeza opcional de sobras (fisioterapia descontinuada, tabela e colunas antigas): só remove o que está vazio; dados de teste só saem com a trava ligada.
- **Storage:** buckets públicos `escudos` (escudo do clube) e `fotos` (atletas e treinadores). As fotos são recortadas/reduzidas no navegador para 512 px WEBP/JPEG antes de subir ([photos.ts](src/lib/photos.ts)), ficando com ~30–80 KB. O caminho é `<clube>/atletas/<atleta>/...` ou `<clube>/treinadores/<treinador>/...`; a comissão envia direto (regras do Storage por clube) e o banco só aceita o endereço depois de conferir a pasta (RPCs `club_set_athlete_photo`/`club_set_coach_photo`). **A foto do próprio atleta passa pela Edge Function `foto-atleta`**, que confere a sessão do app: nenhuma regra do Storage aceita envio sem login. Cada pessoa fica com uma foto só (ao trocar, as anteriores da pasta saem) e excluir o atleta apaga a pasta dele. Para acompanhar o plano gratuito, veja **Storage → Usage** no painel: 100 atletas com foto ocupam cerca de 5 MB.

## Regras de segurança (não quebrar)

- **Atleta não usa o Supabase Auth.** Ele entra com CPF + senha (`athlete_login`, com limite de tentativas; senha errada volta como `{ erro }` para a tentativa ficar registrada) pelas funções `athlete_*`, que recebem o token da sessão (`p_token`) e descobrem o atleta no banco. **`athlete_id` nunca vem do navegador.** Toda leitura/escrita do atleta passa por uma função `athlete_*` em [src/lib/athleteAuth.ts](src/lib/athleteAuth.ts); nunca use `supabase.from(...)` em telas do atleta (o cliente dele é anônimo).
- **Treinador** usa as tabelas direto; o RLS limita ao clube dele (`club_id = public.current_club_id()`). Toda tabela nova de dados do clube recebe `club_id` e as 4 políticas padrão ("Clube: leitura/inclusão/alteração/exclusão", escrita bloqueada quando `support_club_id()` não é nulo).
- **Modo suporte** (dono da plataforma em `/restrito`): somente leitura. Funções que escrevem conferem `support_club_id() is null`.
- Com RLS, um `delete` bloqueado não dá erro (apaga 0 linhas). Para excluir pelo id, use `deleteById` de [src/lib/supabase.ts](src/lib/supabase.ts), que confere se apagou.

## Convenções do app

- **Datas e horas: sempre horário de Brasília** (mesmo fuso do banco, `training_today()`). Use [src/lib/date.ts](src/lib/date.ts): `todayISO()`, `nowTimeHM()`, `stampInAppZone()`, `addDaysISO()`. Nunca `new Date().toISOString().slice(0, 10)` nem o fuso do aparelho. Datas viajam como texto `AAAA-MM-DD`.
- As respostas do atleta usam a data de hoje definida pelo banco (o atleta não escolhe o dia). PSR e peso: **um por dia** (o banco recusa o segundo com `psr_ja_enviado`/`peso_ja_enviado`; para corrigir, o atleta apaga no Histórico). PSE: várias por dia (vários treinos).
- Avisos e confirmações: `useDialogs()` de [src/components/ui/Dialogs.tsx](src/components/ui/Dialogs.tsx) (`notify`, `await confirm(...)`). Não use `alert()`/`confirm()` do navegador.
- Erros do banco chegam como códigos em português (`nao_autorizado`, `sessao_invalida`...) e viram mensagens nas tabelas de tradução (`ERROR_MESSAGES` em `athleteAuth.ts`, `MESSAGES` em `team.ts`/`platform.ts`, `groupError`).
- Consultas que podem passar de 1000 linhas precisam paginar com `.range()` (ver `fetchRange` em `coach/period/shared.ts`).
- Efeitos que buscam dados: cancelar respostas atrasadas (`let cancelled = false` no cleanup) para trocar filtros rápido não mostrar dados antigos.
- Textos da tela, comentários e mensagens em **português do Brasil**, curtos e sem jargão.
- Tipo de treino de preparação física: `PHYSICAL_TRAINING` / `isPhysicalTraining()` em [src/data/constants.ts](src/data/constants.ts).

## Mapa do código

- `src/App.tsx` escolhe entre área do atleta, do treinador, convite de clube e Área Restrita.
- **Atleta** ([AthleteArea.tsx](src/components/AthleteArea.tsx)): 5 abas fixas embaixo — Hoje, Agenda, Histórico, PRs, Rivais. O peso só entra na lista de Hoje nos dias de pesagem do clube. Formulários (PSE, PSR, peso) e a ficha do treino físico abrem por cima ("tela aberta"). A tela Hoje vem de uma consulta só (`athlete_home` / `getAthleteHome`). Telas do atleta ficam em `src/components/athlete/`.
- **Compartilhar (Stories):** cartões 1080 × 1920 feitos no celular ([storyCard.ts](src/lib/storyCard.ts), baixado só ao compartilhar) com as contas em [achievements.ts](src/lib/achievements.ts) (sequência, selos, resumos) e os dados de `athlete_achievements`. Para abrir a prévia: `useShareStory()?.openStory(card)` ([ShareStory.tsx](src/components/athlete/ShareStory.tsx)). **Foto pós-treino:** ao enviar a PSE de um treino (ou no botão "Postar" do treino na tela Hoje) abre a câmera do celular e o app põe por cima a figurinha do treino ([trainingSticker.ts](src/lib/trainingSticker.ts), [TrainingPhotoShare.tsx](src/components/athlete/TrainingPhotoShare.tsx)): nome, horário, duração, PSE dada e esperada; o atleta pode esconder as notas. Fora dessa figurinha, nunca pôr PSE, PSR, dor ou valor de peso na imagem.
- **Treinador** ([CoachArea.tsx](src/components/CoachArea.tsx)): 4 áreas (Hoje, Análises, Planejamento, Elenco) com seções; treinadores e cores na engrenagem (só admin). Para uma tela nova, acrescente em `AREAS` em vez de criar aba nova.
- Navegação no histórico do navegador (`useHistoryState` em [navigation.ts](src/lib/navigation.ts)): o "voltar" do celular volta de tela. Telas já abertas ficam montadas (escondidas).
- Telas carregadas sob demanda com `lazyNamed` ([lazy.ts](src/lib/lazy.ts)): o atleta não baixa o código do treinador.
- Lista de atletas e grupos com cache de 2 min por clube (`fetchClubAthletes` em [athletes.ts](src/lib/athletes.ts), `listGroupsCached`/`useClubGroups`). Depois de alterar atleta ou grupo, chame `invalidateClubAthletes()` / `invalidateGroups()`. Essa lista não traz CPF nem celular.
- "Hoje" que vira sozinho à meia-noite: `useTodayISO()` ([useToday.ts](src/lib/useToday.ts)).
- `src/components/coach/`: telas do treinador. Telas grandes ficam divididas em subpastas (`adversaries/`, `period/`).
- `src/lib/`: acesso ao banco e cálculos puros (`load.ts` = carga interna/ACWR/monotonia, `stats.ts`, `barbellCalculator.ts` = montagem da barra, arredonda a carga **para baixo**, `weightPlan.ts` = limite acima da categoria até a pesagem: 8% com 14+ dias, 5% de 7 a 13, 3% de 1 a 6, categoria no dia, `cpf.ts`, `export.ts` = CSV para Excel com proteção contra fórmulas, `photos.ts` = redução e envio de fotos). Avatares: `ui/Avatar.tsx` (foto ou iniciais) e `ui/PhotoPicker.tsx` (avatar clicável que envia a imagem).
- `supabase/functions/enviar-lembretes`: chamada pelo pg_cron a cada 5 min; quem recebe lembrete é decidido em `public.push_due_reminders`. Proteção opcional por segredo (`CRON_SECRET` + cabeçalho `x-cron-secret`; passo a passo no fim da parte 7 do SQL).
- `supabase/functions/foto-atleta`: foto do próprio atleta (recebe a imagem + cabeçalho `x-athlete-token`, confere com `athlete_get_session` e grava com a chave do servidor). Publicar: `npx supabase functions deploy foto-atleta --no-verify-jwt`.
