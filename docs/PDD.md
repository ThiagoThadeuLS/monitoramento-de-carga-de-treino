# PDD — PROCESS DESIGN DOCUMENT

**Projeto:** App de Monitoramento de Atletas
**Cliente:** Uso interno (equipe/clube esportivo)
**Versão:** 1.0 **Data:** 2026-10-30 **PO:** Thiago Thadeu Leal Santos

---

## 1. Visão Geral do Processo

### 1.1 Nome do processo
Monitoramento diário de carga de treino e recuperação do atleta.

### 1.2 Objetivo do processo redesenhado
Substituir o registro manual em planilha pelo autorregistro digital do atleta, consolidado automaticamente para o treinador.

### 1.3 Comparativo AS-IS vs TO-BE
- **Antes:** atleta relata verbalmente ou em planilha compartilhada → **Depois:** atleta registra direto no app, sem login, em formulário padronizado.
- **Antes:** treinador digita/consolida manualmente os dados do elenco → **Depois:** treinador vê consolidado automático na "Visão Geral do Dia".
- **Antes:** sem validação de integridade dos dados (erros de digitação, atleta duplicado) → **Depois:** validação de atleta ativo, bloqueio de `athlete_id` inválido, RLS no banco.

---

## 2. Fluxo AS-IS (processo atual, pré-sistema)

**Gatilho:** fim do treino do dia.

- **Etapa 1:** Atleta informa verbalmente ou por mensagem seu estado (esforço, recuperação, peso) | Executado por: Atleta | Sistema: WhatsApp/papel | Tempo: variável
- **Etapa 2:** Treinador/preparador físico transcreve as informações em planilha | Executado por: Treinador | Sistema: Excel/Google Sheets | Tempo: minutos por atleta
- **Conclusão:** Planilha consolidada manualmente, sujeita a atraso e erro de transcrição.

**Gargalos:** falta de padronização dos dados coletados; dependência de disponibilidade do treinador para digitar; risco de perda de histórico; sem alerta automático de atletas fora do padrão.

---

## 3. Fluxo TO-BE (processo com o app)

**Gatilho:** atleta finaliza o treino do dia e abre o app.

### Etapa 1 — Seleção do atleta
- **Executado por:** Atleta
- **Input:** nome do atleta selecionado em lista (sem login)
- **Processamento:** app busca atletas com `active = true` no Supabase; valida se o `athlete_id` salvo em `localStorage` ainda existe na lista atual
- **Output:** atleta selecionado e persistido localmente para a sessão
- **Integração:** Supabase (tabela `athletes`)
- **Exceção:** se a busca falhar ou retornar vazio, exibir banner de erro explícito ao invés de preencher com dados fictícios (correção aplicada em `AthleteArea.tsx`)

### Etapa 2 — Registro de PSE
- **Executado por:** Atleta
- **Input:** tipo de treino, RPE (1–10) ou "não treinei", observações
- **Processamento:** validação de campos no formulário (`PseForm`); insert direto na tabela
- **Output:** registro `pse_records` salvo com `athlete_id` e data
- **Integração:** Supabase (`pse_records`, insert anônimo permitido)
- **Exceção:** falha de rede → mensagem de erro ao atleta, dado não perdido no formulário (retry manual)

### Etapa 3 — Registro de PSR
- **Executado por:** Atleta
- **Input:** recuperação, fadiga, sono, dor muscular, estresse, humor (1–10 cada)
- **Processamento:** validação no formulário (`PsrForm`); insert direto
- **Output:** registro `psr_records` salvo
- **Integração:** Supabase (`psr_records`, insert anônimo permitido)
- **Exceção:** igual à Etapa 2

### Etapa 4 — Registro de Peso
- **Executado por:** Atleta
- **Input:** peso corporal (30–250 kg), data
- **Processamento:** validação de faixa no formulário (`WeightForm`); insert direto
- **Output:** registro `weight_records` salvo
- **Integração:** Supabase (`weight_records`, insert anônimo permitido)
- **Exceção:** valor fora da faixa é bloqueado no formulário antes do envio

### Etapa 5 — Login do treinador
- **Executado por:** Treinador
- **Input:** e-mail e senha
- **Processamento:** `supabase.auth.signInWithPassword`; sessão mantida via `onAuthStateChange`
- **Output:** sessão autenticada liberando acesso à área do treinador
- **Integração:** Supabase Auth
- **Exceção:** credenciais inválidas → mensagem de erro no `CoachLogin`

### Etapa 6 — Visão Geral do Dia
- **Executado por:** Treinador (consulta) / Sistema (consolidação)
- **Input:** data selecionada
- **Processamento:** query consolidada de `pse_records`, `psr_records`, `weight_records` do dia, agrupada por atleta (`DailyOverview`)
- **Output:** painel com estado de cada atleta no dia
- **Integração:** Supabase (leitura autenticada, CRUD total liberado)
- **Exceção:** atleta sem registro no dia aparece como pendente/sem dado (não some da lista)

### Etapa 7 — Gestão do Elenco
- **Executado por:** Treinador
- **Input:** dados do atleta (nome, classe, categoria, celular, sexo, ativo/inativo)
- **Processamento:** CRUD em `AthleteManagement`, podendo originar-se de um atleta selecionado na Visão Geral
- **Output:** cadastro de atleta atualizado
- **Integração:** Supabase (`athletes`, CRUD autenticado)
- **Exceção:** inativar atleta remove-o da lista de seleção do atleta sem apagar seu histórico (FK com cascade apenas em exclusão definitiva)

**Conclusão:** dados do dia ficam disponíveis em tempo real para o treinador, sem transcrição manual.

---

## 4. Arquitetura do Agente/Sistema

- **4.1 Tipo:** Aplicação web CRUD (sem componente de IA/LLM nesta versão)
- **4.2 Orquestrador:** N/A — frontend React + Vite consumindo Supabase diretamente via SDK
- **4.3 Modelos de IA:** Não aplicável nesta versão
- **4.4 Base de dados:** Postgres (Supabase), schema em `supabase_schema.sql`, RLS habilitado em todas as tabelas
- **4.5 Execução de código:** Validações client-side (React) + constraints de banco (ex: `weight between 30 and 250`, `rpe_score between 1 and 10`)
- **4.6 Memória:** `localStorage` usado apenas para persistir a seleção do atleta entre sessões (sem dado sensível)
- **4.7 Canal de entrega:** Web app responsivo (Vite build), hospedado na Vercel

> Nota: não há regra de cálculo por LLM neste projeto — não se aplica a regra anti-alucinação da seção de IA. Toda validação de faixa de valores é feita por constraint de banco e validação de formulário, não por inferência.

---

## 5. Mapa de Integrações

**Sistema:** Supabase (Postgres + Auth)
**Endpoint/Método:** SDK `@supabase/supabase-js`, via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
**Autenticação:** Anon key para inserts públicos; Supabase Auth (email/senha) para área do treinador
**Dados de Entrada:** registros de PSE/PSR/peso (anônimo); credenciais de login (treinador)
**Dados de Saída:** lista de atletas ativos; registros consolidados por dia
**Frequência:** real-time (chamadas diretas a cada ação do usuário)
**Fase:** Piloto
**Responsável:** Thiago Thadeu (desenvolvedor/PO)

**Sistema:** Vercel
**Endpoint/Método:** Deploy via `vercel.json` + variáveis de ambiente
**Autenticação:** N/A (infraestrutura de build/hosting)
**Dados de Entrada:** build do frontend
**Dados de Saída:** app servido estaticamente
**Frequência:** a cada deploy
**Fase:** Piloto
**Responsável:** Thiago Thadeu

---

## 6. Tratamento de Exceções

| Situação | Probabilidade | Ação do Sistema | Escala Humano? |
|---|---|---|---|
| Falha ao carregar lista de atletas (Supabase indisponível) | Baixa | Exibir banner de erro explícito, sem usar dados mock | Não |
| `athlete_id` salvo em `localStorage` não existe mais (atleta inativado/removido) | Média | Invalidar seleção local e forçar nova seleção (`validAthleteId`) | Não |
| Valor de peso fora da faixa 30–250 kg | Baixa | Bloquear envio no formulário com validação | Não |
| Login do treinador com credenciais inválidas | Média | Mensagem de erro no `CoachLogin`, sem liberar sessão | Não |
| Atleta tenta registrar mais de uma vez no mesmo dia | Alta | Hoje não há bloqueio — permite múltiplos registros no dia (decisão a confirmar com negócio) | Sim, se regra de negócio exigir unicidade |

---

## 7. Casos de Teste UAT

**Caso 1 — Fluxo principal (caminho feliz)**
- Input: atleta ativo seleciona seu nome, preenche PSE com RPE 7
- Output esperado: registro salvo em `pse_records` com `athlete_id` correto e `created_at` preenchido
- Critério: registro aparece na "Visão Geral do Dia" do treinador para a data correta

**Caso 2 — Login e consulta do treinador**
- Input: treinador autentica com e-mail/senha válidos
- Output esperado: acesso à área do treinador, com Visão Geral do Dia carregando dados reais
- Critério: nenhum dado mock aparece; dados batem com os registros inseridos no banco

**Caso 3 — Atleta inativado não aparece para seleção**
- Input: treinador marca atleta como inativo
- Output esperado: atleta desaparece da lista de seleção da área do atleta
- Critério: 0 novos registros possíveis para esse `athlete_id` via interface

**Caso 4 — Exceção técnica: Supabase indisponível**
- Input: variável de ambiente do Supabase ausente/inválida ou serviço fora do ar
- Output esperado: banner de erro visível na área do atleta, sem fallback silencioso para mock
- Critério: usuário entende que há um problema e não submete dados "no vazio"

**Caso 5 — `athlete_id` órfão em localStorage**
- Input: atleta tinha um `athlete_id` salvo localmente que foi removido do banco
- Output esperado: seleção é invalidada automaticamente, usuário precisa reselecionar
- Critério: nenhum insert é feito com `athlete_id` inexistente (FK constraint nunca é violada)

---

## 8. Checklist de Deploy

- [ ] Ambiente de teste (Supabase project separado ou branch) configurado
- [ ] `supabase_schema.sql` aplicado e RLS validado em produção
- [ ] Variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) configuradas na Vercel
- [ ] Alteração pendente em `src/components/AthleteArea.tsx` revisada, testada e commitada
- [ ] Casos UAT (seção 7) executados manualmente e aprovados
- [ ] Cadastro real do elenco migrado/validado (sem dados mock remanescentes)
- [ ] Treinador orientado sobre fluxo de login e gestão de elenco
- [ ] Backup do banco (Supabase) configurado antes do go-live
- [ ] Aceite informal do responsável pelo clube/equipe registrado
