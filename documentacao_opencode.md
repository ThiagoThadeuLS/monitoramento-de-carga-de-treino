# Documentação Técnica — Monitoramento de Carga de Treino

> Documento criado para servir de base ao desenvolvimento de novas funcionalidades.
> Escrito em 2026-11-09 a partir da leitura completa do código-fonte.

---

## 1. O que é o app (visão geral)

Plataforma **multi-clube** de monitoramento de carga de treino (piloto: judô do **Minas Tênis Clube**), em produção em `https://monitoramento-coral.vercel.app`.

Três públicos, três formas de entrar:

| Público | Como entra | O que faz |
|---|---|---|
| **Atleta** | App instalado no celular (PWA), **CPF + senha** (login próprio, NÃO usa Supabase Auth) | Registra **PSE** (esforço por treino, com duração), **PSR** (bem-estar), **peso**; vê agenda, histórico, PRs, rivais, conquistas; recebe lembretes por notificação |
| **Treinador / comissão técnica** | E-mail + senha (Supabase Auth), no computador ou app | Painel do clube: dia, análises (período, carga, relatórios), planejamento (agenda, preparação física, competições), elenco (atletas, grupos, rivais), configurações (treinadores, cores) |
| **Dono da plataforma** | `/restrito`, e-mails fixos em `platform_owners` | Convida/suspende clubes, **modo suporte** (somente leitura, 2h, auditado) |

**Regra de ouro do isolamento:** cada clube só vê os próprios dados (`club_id` + RLS no banco).

Documentos de produto: `docs/PRD.md` (requisitos) e `docs/PDD.md` (processo). Documento para IA de coding: `CLAUDE.md`. Explicação das métricas fisiológicas: `docs/fisiologia/como-as-metricas-sao-calculadas.md`.

---

## 2. Stack e comandos

- **React 18 + TypeScript + Vite + Tailwind** (tema escuro, cores do clube via variáveis CSS).
- **Supabase**: Postgres + Auth (só treinadores/donos) + Storage (buckets públicos `escudos` e `fotos`) + Edge Functions (Deno) + pg_cron/pg_net.
- **Vercel**: deploy estático. Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.
- Ícones `lucide-react`; gráficos `recharts`; PDF `jspdf` + `html2canvas`; testes `vitest`.
- **PWA**: `public/manifest.webmanifest` + `public/sw.js` (cache de assets, Web Push). No celular o app **só funciona instalado** (`InstallGate`).

```bash
npm run dev         # servidor local (precisa do .env)
npm run build       # tsc + vite build
npm test            # vitest (cálculos puros em src/lib/*.test.ts)
npm run lint        # eslint (com react-hooks/exhaustive-deps)
npm run typecheck
npm run db:migrate  # aplica supabase_completo.sql (scripts/migrate.mjs)
```

Antes de encerrar qualquer mudança: `npm run typecheck && npm run lint && npm test`.

---

## 3. Partida do app (`src/main.tsx` → `src/App.tsx`)

`main.tsx` registra o Service Worker, aplica o tema cacheado do clube (`applyCachedTheme`) e monta `DialogsProvider` + `App`.

`App.tsx` decide o que renderizar, em ordem:

1. `window.location.pathname === '/restrito'` → **RestrictedArea** (endereço próprio dos donos).
2. `MOBILE_BROWSER` (celular pelo navegador, sem convite de clube nem recovery de senha) → **InstallGate** ("Baixe o app").
3. `?convite-clube=<código>` na URL → **ClubSignup** (criação do clube pelo convite; única exceção que abre no navegador do celular).
4. `?redefinir-senha=1` ou hash `type=recovery` → começa na view do treinador (link do "esqueci minha senha").
5. Senão: **Header** (trocador Atleta ↔ Treinador) + `AthleteArea` ou `CoachArea`.

Áreas grandes são **lazy** via `lazyNamed` (`src/lib/lazy.ts`): o atleta não baixa o código do treinador e vice-versa. `ClubProvider` (`src/lib/club.tsx`) envolve tudo e fornece `useClub()` (nome, escudo, cores do clube).

---

## 4. Área do ATLETA (`src/components/AthleteArea.tsx` + `src/components/athlete/`)

### 4.1 Autenticação do atleta (diferente de tudo no app)

- Login: **CPF + senha** → RPC `athlete_login`. Senha inicial = nome completo junto e minúsculo (`athlete_initial_password`); troca obrigatória no 1º acesso (`athlete_set_password`, mínimo 6). Hash bcrypt no banco (`athlete_credentials`), tentativas registradas em `athlete_login_attempts` (rate-limit).
- Sessão: token uuid (30 dias) em `athlete_sessions`, guardado em `localStorage` (`athlete_session_token`). Renovado a cada chamada.
- **Segurança central:** `athlete_id` **nunca** vem do navegador. Toda leitura/escrita do atleta passa por uma função `athlete_*` que recebe `p_token` e descobre o atleta no banco (`_athlete_from_token`). **Nunca use `supabase.from(...)` em tela de atleta** — o cliente dele é anônimo.
- Camada de acesso: `src/lib/athleteAuth.ts` (login, sessão, submissões, listagens, traduções de erro em `ERROR_MESSAGES` — códigos em português como `sessao_invalida`, `psr_ja_enviado`).
- A foto do próprio atleta passa pela **Edge Function `foto-atleta`** (header `x-athlete-token`, conferido com `athlete_get_session`), pois o Storage não aceita envio anônimo.

### 4.2 Sequência de "gates" (ordem exata de bloqueio)

1. `.env` ausente → aviso de configuração.
2. Sem sessão → `AthleteLogin`.
3. `must_change_password` → `AthleteChangePassword`.
4. Termo LGPD não aceito / versão antiga → `TermsGate` (`TERMS_VERSION = '2026-11-04'` em `src/components/TermsGate.tsx`; mudar a versão obriga novo aceite de todos).
5. Sem `birth_date` → `BirthDateGate` (nascimento obrigatório: idade, % de gordura, aniversário).
6. Celular sem notificações ativas → `NotificationGate` (no computador, `RemindersCard` opcional).
7. Só então o app em si (com Tour no 1º acesso).

### 4.3 Navegação e abas

- 5 abas fixas embaixo — **Hoje, Agenda, Histórico, PRs, Rivais** (+ Perfil, sem ícone na barra).
- Tudo com `useHistoryState` (`src/lib/navigation.ts`): abas e "telas abertas" (overlays) viram entradas do histórico do navegador → **o "voltar" do celular funciona**. Overlays: `{psr}`, `{peso}`, `{pse, trainingType?, duration?, sessionId?}`, `{treino, id, name}` (ficha física).
- Abas já visitadas ficam **montadas e escondidas** (`hidden`) — troca instantânea, estado preservado. Após o "Hoje" carregar, um `setTimeout` de 1500 ms pré-baixa as telas lazy.
- Deep-links de lembrete na URL (`?aba=pse|psr|peso|agenda|prs|adversarios|historico`).

### 4.4 Tela "Hoje" (uma consulta só)

`getAthleteHome(token)` → RPC **`athlete_home`** devolve: dia atual (`training_today()`), PSR do dia, peso do dia/último, PSEs do dia, se hoje é dia de pesagem (`club_reminder_settings`), treinos de hoje (com `completed` para treino físico), catálogo de PRs. `AthleteToday.tsx` monta o checklist:

- PSR pendente, pesagem pendente (só nos dias de pesagem), treinos sem PSE.
- `matchPseToSessions` (`src/lib/pseMatch.ts`) casa cada PSE respondida com o treino daquele tipo na ordem do horário (mesma regra do relatório do treinador).
- Treino físico → "Abrir ficha" → overlay `{treino}` com `AthletePhysicalWorkoutExecution`.
- Ao enviar PSE de um treino → guarda `pendingTraining` e, quando o overlay fecha, o `ShareStoryProvider` abre a **foto pós-treino**.
- Recarrega ao enviar resposta (`reloadHome`), ao virar o dia (`useTodayISO`, meia-noite de Brasília) e ao voltar para o app (`visibilitychange`).

### 4.5 Formulários (overlays por cima das abas)

- **`PseForm`** — tipo (Técnico/Randori/Físico), duração 1–600 min (atalhos 60/90/120, sugestão do cronograma), PSE 1–10 (escala Foster com cores de `PSE_SCALE`), observações, "Não treinei" com **motivo obrigatório**. → RPC `athlete_submit_pse` (trigger `pse_fill_duration` completa a duração com a do treino programado se vier vazia).
- **`PsrForm`** — 6 métricas 1–10 (recuperação, fadiga, sono, dor muscular, estresse, humor; nota baixa = pior). → `athlete_submit_psr`. **Um PSR por dia** (banco recusa o 2º com `psr_ja_enviado`).
- **`WeightForm`** — 30–250 kg, botões ±0,1/±0,5, vírgula aceita. → `athlete_submit_weight`. **Um peso por dia** (`peso_ja_enviado`). Correção = apagar no Histórico e reenviar.

### 4.6 Demais telas do atleta (`src/components/athlete/`)

| Arquivo | O que faz | Banco |
|---|---|---|
| `AthleteCompetitionList.tsx` | Próximas competições (top 3) no alto da Agenda; botão compartilhar | `athlete_list_competitions` |
| `AthleteCompetitionCard.tsx` | Card "peso para competição" na tela Hoje: status `risco/atencao/seguro/no_alvo`, limites 8%/5%/3%, tendência, gráfico 21 dias | `athlete_list_competitions` + `athlete_get_history` (35 dias) |
| `AthleteHistory.tsx` | Próprias respostas com gráficos (7/30/90 dias), carga 7d, correção/exclusão **só de respostas de hoje**; termo reaberto aqui | `athlete_get_history` (com 27 dias extras p/ carga crônica), `athlete_delete_record` |
| `AthletePrView.tsx` | Recordes pessoais: escolhe exercício do catálogo do clube, registra PR; **ao bater recorde abre o card de compartilhamento sozinho** | `athlete_list_prs`, `athlete_save_pr`, `athlete_delete_pr` |
| `AthletePhysicalWorkoutExecution.tsx` | Ficha do treino físico: cronômetro persistente (localStorage `workout_timer_{athleteId}_{sessionId}`), carga teórica = PR × % (arredonda **para baixo**), montagem de barra com anilhas coloridas, "Concluir treino e avaliar esforço" → abre PSE com a duração cronometrada | `athlete_get_workout`, `athlete_complete_workout` |
| `AthleteProfileTab.tsx` | Perfil: foto (`PhotoPicker`), nome de exibição, nascimento, card WHOOP | `athlete_update_profile`, Edge `foto-atleta` |
| `AthleteBodyComposition.tsx` | % de gordura do atleta (somente leitura; dobras em mm ficam só com a comissão) | `athlete_body_composition` |
| `AthleteAchievements.tsx` | Faixa de sequência 🔥, banner de selo novo/resumo, painel no Histórico | `athlete_achievements` |
| `ShareStory.tsx` | Provider + dialogs de prévia dos cartões; hooks `useShareStory()` | — (canvas local) |
| `TrainingPhotoShare.tsx` | Foto pós-treino: câmera/galeria, figurinha arrastável, escuro/claro, esconder notas | — (canvas local) |
| `PrShareCard.tsx` | Card 1080×1920 do PR com mini-gráfico de evolução | — (canvas local) |
| `WhoopCard.tsx` | Conexão WHOOP: conectar (OAuth), sincronizar, desconectar | `athlete_whoop` + Edge `whoop` |

### 4.7 Compartilhamento (Stories) — tudo no navegador

- `src/lib/storyCard.ts` — desenha os cartões 1080×1920 (`renderStory`, kinds: pr/sequencia/resumo/competicao/selo), cores lidas do tema do clube, carrega foto+escudo com CORS e **fallback** se uma imagem "sujar" o canvas. Baixado só ao compartilhar (`import()` dinâmico).
- `src/lib/achievements.ts` — "só contas": sequência (dia de folga não quebra), selos (7/30/100 dias; 10/50/100/250/500 treinos; 4/12 pesagens no limite), resumos semana/mês.
- `src/lib/trainingSticker.ts` — a figurinha do treino (nome, horário, duração, PSE dada × esperada com régua colorida) sobre a foto; PSE, PSR, dor e valor de peso **nunca** aparecem fora da figurinha, e nela só se o atleta quiser.

### 4.8 Lembretes (push)

- `src/lib/push.ts` — estados `unsupported/needs-install/denied/off/on`; `enablePush` pede permissão, registra o SW e salva a assinatura via RPC `athlete_save_push`; `relinkPush` religa aparelho já permitido ao atleta logado sem perguntar de novo; `sameServerKey` detecta troca de chave VAPID.
- Regras (decididas no banco por `push_due_reminders`): PSR no início do horário de avisos nos dias com treino; PSE 20 min após o fim de cada treino; peso nos dias/horário de pesagem; repetição a cada 20/30 min até responder; sempre horário de Brasília e dentro da janela do clube.
- A Edge Function `enviar-lembretes` roda de 5 em 5 min (pg_cron) e envia o que venceu.

---

## 5. Área do TREINADOR (`src/components/CoachArea.tsx` + `src/components/coach/`)

### 5.1 Estrutura declarativa `AREAS`

O treinador entra com **e-mail + senha** (`CoachLogin` → `supabase.auth.signInWithPassword`; "esqueci minha senha" → `resetPasswordForEmail` com `redirectTo /?redefinir-senha=1`; senha temporária → troca obrigatória no 1º acesso, mínimo 8). Gate de perfil via RPC `my_profile` (papel, ativo, clube suspenso?, suporte ativo?).

Áreas → subáreas (todas lazy, montadas uma vez, `hidden` quando inativas; navegação no histórico com `useHistoryState('treinador_nav')`):

| Área | Subáreas (componentes) |
|---|---|
| **Hoje** | `DailyOverview` (todas as PSE/PSR/peso/alertas do dia), `CompetitionRiskCard`, `PushStatusCard`, `WeightReminderSettings`, `MissingResponses` |
| **Análises** | `PeriodAnalysis` (período com filtros, gráficos, sem resposta, alertas, exportação CSV), `LoadAnalysis` (ACWR/monotonia/strain), `ReportBuilder` (relatório PDF por atleta) |
| **Planejamento** | `TrainingSchedule` (cronograma), `PhysicalWorkoutBuilder` (fichas de treino físico), `BodyComposition` (dobras), `CompetitionManagement` |
| **Elenco** | `AthleteManagement`, `GroupManagement`, `AdversaryManagement` |
| **Config** (admin, engrenagem no topo) | `TeamManagement`, `ThemeSettings` |

**Para criar tela nova: acrescente em `AREAS`, não crie aba nova.**

### 5.2 Hoje

- `DailyOverview` — por atleta: todas as PSE do dia (nota/tipo/horário), PSR, peso, alertas (dor, fadiga alta, esforço máximo). Cards no celular, tabela no computador.
- `MissingResponses` — "sem resposta no prazo" até o fim do horário de avisos; quem respondeu depois aparece como Atrasado (usa `matchPseToSessions`).
- `CompetitionRiskCard` — quem está em risco de peso para a próxima competição (via `coach_competition_summary` + `buildWeightPlan`).
- `WeightReminderSettings` — grava em `club_reminder_settings` (janela de avisos `notify_from/notify_until`, dias/horário de pesagem).
- `PushStatusCard` — saúde das notificações do elenco (RPC `coach_push_status`).

### 5.3 Análises

- **Período** (`coach/period/`): filtros de data (máx. 1 ano), grupos/pessoas, tipos de treino, modo condensado/por tipo; gráficos PSE (média ↔ moda) × PSE esperada do cronograma, PSR por dia; tabela sem resposta; alertas de um dia (`PSE_LIMIT = 6`, `PSR_LIMIT = 5`); **exportação CSV** (PSE+carga, PSR, peso — `;`, vírgula decimal, BOM, proteção contra fórmula). Consultas paginadas por `fetchRange` (`coach/period/shared.ts`, páginas de 1000 — limite do Supabase).
- **Carga** (`LoadAnalysis` + `src/lib/load.ts`): carga da sessão = PSE × minutos (UA de Foster); aguda 7d, crônica 28d, **ACWR** (zonas: <0,8 baixa / 0,8–1,3 ideal / 1,3–1,5 atenção / >1,5 risco), **monotonia** (média ÷ desvio-padrão; alerta > 2), **strain**; cartões-resumo, gráfico do grupo, tabela por atleta exportável.
- **Relatório** (`coach/report/`): monta PDF com `jspdf` + `html2canvas` (import dinâmico), 8 métricas selecionáveis, gráfico por atleta, tabelas, notas gerais/lesões; captura blocos `[data-report-page]`.

### 5.4 Planejamento

- **`TrainingSchedule`** — CRUD de `training_sessions`: data, horário, nome, tipo, **PSE esperada**, anotações e **público** (todos / somente grupos+pessoas / todos exceto). Janela permitida: semana passada (consulta) + atual + próxima (`scheduleWeekBounds` de `src/lib/date.ts`; banco valida com `training_sessions_check_window`). Toque em treino físico → `onOpenWorkout` abre o `PhysicalWorkoutBuilder` naquele treino.
- **`PhysicalWorkoutBuilder`** — catálogo de exercícios do clube (`club_exercises`, nome único por clube) + prescrições do treino (`workout_prescriptions`, blocos com séries/reps/%PR/observação, ordem `posicao`). **Modelos de ficha** (`workout_templates`): montar por blocos com arrastar (ou setas), "Usar modelo" (adiciona ou substitui — **copia**, editar o modelo depois não muda treinos passados), duplicar, excluir. Cálculos em `src/lib/workoutTemplates.ts`.
- **`BodyComposition`** — avaliações de dobras (protocolo Jackson & Pollock 7 dobras) por atleta; % de gordura via `src/lib/bodyFat.ts` (`pollockDensity` → `siriPercent`); histórico e mapa de calor por dobra (`ui/BodySilhouette` com as imagens de `public/corpo/`).
- **`CompetitionManagement`** — CRUD de `competitions` (nome, data, pesagem, público), tabela do elenco com peso atual × limite da categoria, ordenada por risco.

### 5.5 Elenco

- **`AthleteManagement`** — CRUD direto na tabela `athletes` (RLS do clube): nome, CPF (válido e único, `src/lib/cpf.ts`), classe, categoria, celular, sexo, foto, **inativar/reativar** (mantém histórico), excluir (apaga tudo, `deleteById` que detecta exclusão bloqueada por RLS), redefinir senha do atleta (RPC `coach_reset_athlete_password`). Badges "Inativo" e "Termo pendente".
- **`AthleteProfile`** (ficha, aberta do Dia/Carga/Gestão) — situação, indicadores atuais, 4 gráficos (carga, ACWR, PSE+PSR, peso; 30/60/90 dias), faltas com motivo, WHOOP, exportação CSV.
- **`GroupManagement`** — grupos com membros (um atleta em vários grupos); salvar via RPC `club_save_group`. Usados no público dos treinos/competições e nos filtros.
- **`AdversaryManagement`** (rivais, `coach/adversaries/`) — fichas de adversários (nome, categoria, classe, origem, observações táticas por autor). **Reutilizado pelo atleta** (props `athleteToken` → RPCs `athlete_*`). Ocultar = "apagar para mim" (tabela `adversario_ocultos`).

### 5.6 Config (só admin)

- `TeamManagement` — treinadores: senha temporária (mostrada 1×, Copiar/WhatsApp), promover/rebaixar admin, desativar (o clube nunca fica sem admin ativo; admin não altera a própria conta). Cadastro com cliente isolado (`createDetachedClient`) + compensação (`club_cancel_coach_invite`) se algo falhar.
- `ThemeSettings` — 8 paletas ou personalizada (`theme.ts`: `PRESETS`, contraste WCAG, variáveis CSS `--sky-*`/`--slate-*`), salva via RPC `club_set_theme`.

### 5.7 Caches de listas

`fetchClubAthletes` / `listGroupsCached` (`src/lib/athletes.ts`, `groups.ts`): cache de 2 min por clube, **sem CPF/celular**. Depois de alterar atleta/grupo → `invalidateClubAthletes()` / `invalidateGroups()`. Efeitos que buscam dados usam `let cancelled = false` no cleanup (troca rápida de filtro não mostra dados antigos).

---

## 6. Área Restrita / plataforma (`src/components/RestrictedArea.tsx` + `coach/PlatformPanel.tsx`)

- Rota `/restrito`; gate `my_profile` → `is_owner` (e-mails em `platform_owners`).
- `PlatformPanel` (owner sem suporte): convites de clube (`owner_create_club_invite` → link `?convite-clube=` preso ao e-mail, 7 dias, uso único), lista de clubes, suspender/reativar (`owner_set_club_status`), log de acessos (`owner_list_access_log`).
- **Modo suporte** (`owner_enter_support`): vê o painel do clube em **somente leitura** por até 2h (`owner_support_sessions`); o banco bloqueia escrita (toda política de escrita exige `support_club_id() is null`); tudo auditado em `owner_access_log`. Reusa DailyOverview, PeriodAnalysis, TrainingSchedule/AthleteManagement/AdversaryManagement em `readOnly`.
- `ClubSignup` — criação do clube pelo convite (nome, escudo, senha); trigger `auth_users_require_invite` bloqueia cadastro sem convite; `auth_users_link_coach` vincula e cria o clube.

---

## 7. Banco de dados — `supabase_completo.sql` (~4900 linhas)

### 7.1 Regras do arquivo (CRÍTICAS)

- **Um único arquivo**, dividido em PARTES numeradas (0–19; as partes 16/17/18 existem "bis" porque foram acrescentadas depois). Roda **inteiro, de novo, a cada mudança** (SQL Editor ou `npm run db:migrate`).
- **Tudo idempotente**: `create table if not exists`, `create or replace function`, `drop policy if exists` antes de `create policy`, `add column if not exists`.
- O arquivo roda **em ordem**: se uma parte chama uma função logo após criá-la, vale a versão daquela parte. **Ao mudar uma função, mexa em TODAS as partes onde ela aparece** (ex.: `athlete_list_prs` existe na parte 12 e reescrita na 16-bis).
- **O script não apaga dados** (nada de `delete`/`truncate` soltos). Regra nova em dados antigos: primeiro verificar com `raise notice`.
- Arquivos irmãos: `supabase_dados_ficticios.sql` (36 atletas do clube de teste "Desenvolvimento"), `supabase_diagnostico.sql` (verificações de leitura), `supabase_limpeza.sql` (limpeza opcional só do que está vazio).

### 7.2 Tabelas (33)

**Base:** `athletes` (cpf único, nome, birth_date, display_name, club_id, photo_url), `pse_records` (athlete_id, date, type, duration, pse; único por atleta+dia+tipo), `psr_records` (um por dia), `weight_records` (um por dia), `training_sessions` (date, type, notes, duration, PSE esperada, audience, target_group_ids), `adversarios` + `adversario_observacoes` + `adversario_ocultos`, `competitions`.

**Login do atleta:** `athlete_credentials` (bcrypt), `athlete_sessions` (token 30 dias), `athlete_login_attempts` (rate-limit).

**Clube/plataforma:** `clubs` (status, escudo, tema), `coaches` (user_id, club_id, role, active), `coach_invites`, `platform_owners`, `owner_support_sessions`, `owner_access_log`.

**Grupos/lembretes:** `athlete_groups`, `athlete_group_members`, `push_subscriptions` (endpoint único), `reminder_log` (deduplicação), `club_reminder_settings` (janela de avisos + pesagem).

**Preparação física:** `club_exercises` (nome único por clube), `workout_prescriptions` (blocos jsonb, posicao), `workout_templates`, `athlete_prs`, `athlete_pr_history`, `workout_completions`, `body_compositions` (dobras).

**WHOOP:** `whoop_connections` (tokens OAuth — sem RLS, só a Edge com service key), `whoop_pending_states`, `whoop_metrics` (unique athlete_id+date).

### 7.3 Funções/RPC principais

- **Do atleta (~40):** `athlete_login`, `athlete_get_session`, `athlete_set_password`, `athlete_logout`, `athlete_submit_pse/psr/weight`, `athlete_get_schedule`, `athlete_home`, `athlete_get_history`, `athlete_delete_record`, `athlete_terms_status/accept_terms`, `athlete_my_profile/update_profile`, `athlete_list_prs/save_pr/delete_pr`, `athlete_get_workout/complete_workout`, `athlete_achievements`, `athlete_body_composition`, `athlete_list_adversarios` + save/delete/observações/oculto, `athlete_list_competitions`, `athlete_whoop`, `athlete_save_push`, `athlete_tutorial_pending/done`.
- **Do treinador/clube:** `my_profile`, `current_club_id`, `club_add_coach`, `club_set_coach_role/active`, `club_save_group`, `club_theme/set_theme`, `club_set_escudo`, `club_set_athlete_photo/coach_photo`, `coach_reset_athlete_password`, `coach_push_status`, `coach_competition_summary`, `coach_set_adversario_oculto`, `coach_tutorial_pending/done`, `club_whoop_status`.
- **Da plataforma:** `owner_*` (convites, clubes, suporte, log).
- **Infra:** `training_today()` (dia de treino, fuso America/São_Paulo), `training_week_start`, `session_applies_to` (público do treino), `competition_applies_to`, `records_set_club` (trigger que preenche `club_id`), `pse_fill_duration` (trigger), `push_due_reminders`/`push_mark_sent`, `support_club_id`, `is_club_admin`, `is_platform_owner`.

### 7.4 Padrões de segurança

- RLS em tudo; políticas padrão por tabela de clube: leitura `club_id = (select public.current_club_id())` (o `(select ...)` faz o banco calcular uma vez por consulta), escrita idem **e** `(select public.support_club_id()) is null`.
- Funções `security definer` com `set search_path = ''`, nomes qualificados, `revoke` de `public/anon` e `grant` mínimo.
- `delete` bloqueado por RLS **não dá erro** (apaga 0 linhas) → sempre `deleteById` (`src/lib/supabase.ts`, lança `NothingDeletedError`).
- Storage: buckets públicos `escudos`/`fotos`; envio direto só para treinador (regras por clube); foto do atleta pela Edge; caminho `<clube>/atletas/<id>/...`; uma foto por pessoa (anteriores apagadas); imagens reduzidas a 512 px no navegador (`src/lib/photos.ts`, ~30–80 KB).

---

## 8. Edge Functions (`supabase/functions/`, Deno, `verify_jwt = false`)

| Função | O que faz |
|---|---|
| `enviar-lembretes` | Chamada pelo pg_cron a cada 5 min (proteção opcional `CRON_SECRET` + header `x-cron-secret`). Chama `push_due_reminders`, envia Web Push (web-push, chaves VAPID **só** nos segredos da função), marca `push_mark_sent`, remove aparelhos com 5+ falhas |
| `foto-atleta` | Foto do próprio atleta: recebe binário + header `x-athlete-token`, confere com `athlete_get_session`, grava com service key e apaga fotos antigas |
| `whoop` | OAuth 2.0 com a WHOOP (`start/callback/sync/sync_all/disconnect`); tokens em `whoop_connections`; métricas em `whoop_metrics`; sincronização automática opcional via cron com `CRON_SECRET`. Segredos: `WHOOP_CLIENT_ID/SECRET`, `APP_PUBLIC_URL`, opcionais `WHOOP_REDIRECT_URL`, `CRON_SECRET` |

Publicar: `npx supabase functions deploy <nome> --no-verify-jwt`.

---

## 9. Cálculos e convenções transversais (`src/lib/`)

| Arquivo | Papel |
|---|---|
| `date.ts` | **Tudo em horário de Brasília** (`APP_TIME_ZONE`): `todayISO`, `nowTimeHM`, `stampInAppZone`, `addDaysISO`, `scheduleWeekBounds`. Nunca `new Date().toISOString()` nem fuso do aparelho; datas viajam como `AAAA-MM-DD` |
| `load.ts` | Carga Foster (PSE×min), aguda/crônica/ACWR/monotonia/strain, `acwrZone`, `formatUA` |
| `stats.ts` | Média/mediana/moda + cores/formas das séries |
| `weightPlan.ts` | Limite acima da categoria: **8%** com 14+ dias, **5%** de 7–13, **3%** de 1–6, 0% na pesagem; categorias `-66`/`+100` |
| `barbellCalculator.ts` | Montagem da barra (anilhas 25–1 kg), **arredonda para baixo** |
| `bodyFat.ts` | Pollock 7 dobras → densidade → Siri (% gordura) |
| `workoutTemplates.ts` | Manipulação/validação dos blocos das fichas |
| `pseMatch.ts` | Casa PSEs respondidas com treinos programados (atleta e treinador usam a mesma regra) |
| `export.ts` | CSV pt-BR (`;`, BOM, vírgula decimal, anti-injeção de fórmula), `brDate`, `formatKg` |
| `photos.ts` | Recorte/redução para 512 px WEBP/JPEG antes de subir |
| `cpf.ts`, `age.ts` | Validação de CPF; idade/aniversário |
| `supabase.ts` | Cliente, `deleteById`, `NothingDeletedError`, `createDetachedClient` |
| `theme.ts` / `club.tsx` | Cores do clube (8 presets + custom, contraste WCAG, cache local p/ abrir já colorido) / `ClubProvider`, `ClubCrest` |
| `navigation.ts`, `lazy.ts`, `useToday.ts`, `tutorial.ts` | Histórico do navegador; code-splitting; "hoje" que vira à meia-noite; tour visto/pendente |

**UI:** avisos/confirmations com `useDialogs()` (`src/components/ui/Dialogs.tsx`) — nunca `alert()`/`confirm()`. Avatares `ui/Avatar.tsx` + `ui/PhotoPicker.tsx`. Gráficos `recharts` em `coach/DailyStatsChart.tsx` (reusado na área do atleta). Erros do banco viram mensagens via tabelas de tradução (`ERROR_MESSAGES`, `MESSAGES`, `groupError`).

**Textos:** português do Brasil, curtos, sem jargão.

---

## 10. Como ADICIONAR UMA NOVA FUNCIONALIDADE (roteiro)

1. **Definir onde mora**: tela do atleta (componente em `src/components/athlete/` + RPC `athlete_*`), do treinador (entrada em `AREAS` do `CoachArea.tsx`, componente em `src/components/coach/`), ou dos dois.
2. **Banco primeiro** (`supabase_completo.sql`):
   - tabela nova → colunas + `club_id` + as **4 políticas padrão** (leitura/inclusão/alteração/exclusão) + trigger `records_set_club` se for registro do atleta;
   - atleta? → função `athlete_*` com `p_token`, `_athlete_from_token`, validações que devolvem **códigos em português**;
   - idempotente, sem `delete` solto; se a função já existe em outra parte, mexer em todas.
3. **Camada de acesso** em `src/lib/` (`athleteAuth.ts` para atleta; `team.ts`/`platform.ts`/arquivo próprio para treinador) + tipos + tradução de erros.
4. **Componente/tela** seguindo as convenções: `useDialogs`, datas de `lib/date.ts`, efeitos com `cancelled`, paginação `.range()` se puder passar de 1000 linhas, `hidden` + lazy para telas grandes, deep-link/overlay conforme o padrão.
5. **Testes** para cálculos puros em `src/lib/*.test.ts` (vitest). Depois: `npm run typecheck && npm run lint && npm test`.
6. **Aplicar o SQL** (SQL Editor inteiro ou `npm run db:migrate`) **antes** de publicar o front.
7. **Lembretes de privacidade**: dado novo sensível → atualizar `TERMS_VERSION`/`TermsGate.tsx` e `public/privacidade.html`; imagens compartilháveis nunca mostram PSE/PSR/dor/peso (exceto figurinha, opcional).
8. Se envolver Edge Function: publicar com `--no-verify-jwt` e guardar segredos só no Supabase.

### Gatilhos rápidos de decisão

- Novo dado diário do atleta? → RPC `athlete_submit_*` com trava "um por dia" (como PSR/peso) ou múltiplos (como PSE), entrada no `athlete_home`, lembrete em `push_due_reminders` se precisar cobrar.
- Novo relatório/análise? → cálculo puro em `src/lib` com testes; painel novo em `AREAS` do treinador.
- Nova integração wearable? → seguir o padrão WHOOP (Edge Function com OAuth, tabela de tokens sem RLS, métricas com RLS do clube, RPCs `athlete_*`/`club_*`).

---

## 11. Mapa rápido de arquivos

```
src/
  App.tsx                 — roteamento raiz (restrito / install gate / convite / atleta / treinador)
  types.ts, data/constants.ts
  components/
    AthleteArea.tsx       — shell do atleta (gates, abas, overlays, share)
    AthleteLogin.tsx, CoachLogin.tsx, ClubSignup.tsx
    PseForm/PsrForm/WeightForm.tsx, AthleteHistory.tsx, AthletePrView.tsx,
    AthletePhysicalWorkoutExecution.tsx, AthleteCompetitionCard.tsx
    InstallGate/NotificationGate/TermsGate/BirthDateGate.tsx, RemindersCard.tsx
    CoachArea.tsx         — shell do treinador (AREAS)
    RestrictedArea.tsx    — /restrito
    athlete/              — telas do atleta (Today, Profile, Share, Achievements, Whoop...)
    coach/                — painéis do treinador (+ period/, physical/, report/, adversaries/)
    tour/                 — tour guiado (passos em steps.tsx)
    ui/                   — Dialogs, Avatar, PhotoPicker, PhotoCropDialog, BodySilhouette, BodyFatTrend
  lib/                    — acesso ao banco + cálculos puros (ver seção 9)
supabase/
  functions/              — enviar-lembretes, foto-atleta, whoop (Deno)
supabase_completo.sql     — TODO o banco (partes 0–19, idempotente)
supabase_dados_ficticios.sql / _diagnostico.sql / _limpeza.sql
public/                   — sw.js, manifest, privacidade.html, icons/, corpo/
scripts/migrate.mjs       — npm run db:migrate
docs/                     — PRD.md, PDD.md, fisiologia/
```
