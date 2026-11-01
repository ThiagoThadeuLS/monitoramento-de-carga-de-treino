# PRD — PRODUCT REQUIREMENT DOCUMENT

**Projeto:** Plataforma de Monitoramento de Carga de Treino
**Cliente:** Clubes esportivos (piloto: Minas Tênis Clube — judô)
**Versão:** 2.0 **Data:** 2026-10-31 **PO:** Thiago Thadeu Leal Santos
**Status:** EM IMPLANTAÇÃO (funcionalidades implementadas e testadas localmente; pendente aplicação dos SQL e deploy em produção)

> **Histórico de versões**
> - **1.0 (2026-10-30):** MVP single-tenant — atleta registra PSE/PSR/peso selecionando o nome em uma lista (sem login); treinador vê a Visão Geral do Dia e gerencia o elenco.
> - **2.0 (2026-10-31):** plataforma **multi-clube**; login do atleta por CPF; análise do período com gráficos; cronograma semanal; gestão de equipe com papéis; atletas adversários; Área Restrita dos donos da plataforma com modo suporte e registro de acessos.

---

## 1. Visão do Produto

### 1.1 Problema que resolve
Comissões técnicas controlam carga de treino, recuperação e peso dos atletas em planilhas manuais, alimentadas por relatos verbais ou formulários avulsos. Isso atrasa a identificação de atletas em risco de fadiga/lesão, gera retrabalho de digitação e não permite comparar o treino **planejado** com o treino **percebido** pelos atletas.

### 1.2 Solução proposta
Plataforma web responsiva (celular e desktop), vendida para vários clubes, em que:
- o **atleta**, cadastrado pelo clube, entra com CPF e senha e registra PSE (esforço da sessão), PSR (bem-estar) e peso, e consulta o cronograma de treinos do clube;
- a **comissão técnica** acompanha o elenco (visão do dia, análise do período com gráficos e alertas), planeja a semana de treinos com PSE esperada e gerencia atletas, treinadores e adversários;
- os **donos da plataforma** cadastram novos clubes por convite, suspendem/reativam clubes e prestam suporte em modo somente leitura, com registro de acessos.

Cada clube só enxerga os próprios dados.

### 1.3 Usuários e perfis de acesso

| Perfil | Como entra | O que pode fazer |
|---|---|---|
| **Atleta** | CPF + senha (senha inicial = nome completo junto e minúsculo; troca obrigatória no 1º acesso) | Registrar PSE, PSR e peso; ver o cronograma do próprio clube (com anotações dos treinos) |
| **Treinador** | E-mail + senha (senha temporária gerada pelo admin; troca obrigatória no 1º acesso) | Todo o painel do clube: visão do dia, análise do período, cronograma, adversários, gestão de atletas |
| **Admin do clube** | Igual ao treinador (o primeiro admin é quem cria o clube pelo convite) | Tudo do treinador + gestão de treinadores (cadastrar, promover/rebaixar, desativar) e troca do escudo do clube |
| **Dono da plataforma** | Área Restrita (`/restrito`), e-mail + senha; apenas `thiagothadeu11@gmail.com` e `gabrielalmeida99@gmail.com` | Convidar clubes, listar/suspender/reativar clubes, modo suporte (somente leitura) e registro de ações |
| **Técnico** | — | PO/desenvolvedor mantém a infraestrutura (Supabase + Vercel) |

### 1.4 Fora de escopo (nesta versão)
- Notificações automáticas (SMS/WhatsApp) para lembrar o preenchimento (o campo `celular` já existe).
- Histórico/gráficos de evolução individual para o próprio atleta.
- Recuperação de senha pelo app ("esqueci minha senha") e verificação em duas etapas (2FA).
- Cobrança/assinatura automática dos clubes (a suspensão é manual pelos donos).
- Integrações com sistemas externos de performance/saúde (GPS, wearables).
- Suíte de testes automatizados no repositório (os testes desta versão foram executados localmente, ver seção 7).

---

## 2. Objetivos e Métricas de Sucesso

| Métrica | Baseline | Target piloto | Target 90 dias |
|---|---|---|---|
| Adesão diária dos atletas à PSE (respostas/atleta ativo/treino) | 0% (sem sistema) | ≥ 70% | ≥ 90% |
| Adesão diária à PSR (respostas/atleta ativo/dia) | 0% | ≥ 70% | ≥ 90% |
| Uso do app pelo treinador em vez de planilha | 0% | 100% das decisões diárias via app | mantido |
| Treinos da semana planejados no cronograma (com PSE esperada) | 0% | ≥ 80% dos treinos | 100% |
| Registros com atleta inválido/órfão ou no clube errado | indefinido | 0% (garantido pelo banco) | 0% |
| Clubes ativos na plataforma | 1 (Minas) | 1 | ≥ 2 |

---

## 3. Requisitos Funcionais

### 3.1 Atleta
- **RF-01 — Login do atleta:** o atleta entra com CPF + senha. Só atletas **cadastrados pelo clube, ativos e de clube ativo** conseguem entrar. Não existe autocadastro.
- **RF-02 — Senha inicial e troca obrigatória:** a senha inicial é o nome completo, tudo junto e em minúsculas (acentos ignorados; ex.: "João Silva" → `joaosilva`). No primeiro acesso o atleta é obrigado a criar uma senha nova (mínimo 6 caracteres, diferente da inicial) antes de ver qualquer outra tela. A sessão fica salva no aparelho por até 30 dias.
- **RF-03 — PSE:** registrar tipo de treino (Técnico, Randori, Físico), PSE de 1 a 10 (escala de Foster) ou "não treinei", e observações. **O atleta pode registrar mais de uma PSE no mesmo dia** (uma por treino).
- **RF-04 — PSR:** registrar recuperação, fadiga, sono, dor muscular, estresse e humor (1 a 10 cada; nota baixa = pior).
- **RF-05 — Peso:** registrar o peso corporal (30 a 250 kg).
- **RF-06 — Data correta:** todos os registros usam a data local do aparelho (corrige o bug em que respostas após 21h caíam no dia seguinte).
- **RF-07 — Cronograma (somente leitura):** ver os treinos da semana passada, da atual e da próxima. Tocar num treino abre os detalhes (dia, horário, tipo, PSE esperada) e as **anotações do treinador**; cartões com anotação mostram "Ver anotações".
- **RF-08 — Identidade do clube:** após o login, o cabeçalho mostra o nome e o escudo do clube do atleta.

### 3.2 Treinador — painel do clube
Abas: **Dia, Período, Agenda, Adversários, Gestão**.

- **RF-09 — Login do treinador:** e-mail + senha. Contas sem clube, desativadas ou de clube suspenso não veem dados (mensagem explicando o motivo). Treinador criado com senha temporária troca a senha no primeiro acesso (mínimo 8 caracteres).
- **RF-10 — Visão Geral do Dia:** para a data escolhida, mostra por atleta **todas as PSE do dia** (nota, tipo de treino e horário), a PSR, o peso e alertas (dor muscular, fadiga alta, esforço máximo); cartões-resumo com respondentes e médias.
- **RF-11 — Análise do Período:** filtro **De/Até** com atalhos **Hoje, 7, 15 e 30 dias** (máximo 1 ano).
  - Gráfico de **PSE** com setas para alternar entre **Média** e **Moda** das respostas por dia (na moda, empates são todos exibidos no detalhe; a linha usa o maior valor).
  - **Filtro de tipos de treino** (Técnico, Randori, Físico), aplicado à média e à moda.
  - Exibição **Condensada** (uma linha para o grupo) ou **Por tipo de treino** (uma linha por tipo).
  - **PSE esperada** (do cronograma) marcada no gráfico — no modo por tipo, cada tipo tem a própria PSE esperada na cor do tipo — com a **diferença entre respondida e esperada** no detalhe; pode ser ligada/desligada.
  - Gráfico da **média de PSR** do grupo por dia.
  - Detalhe ao passar o mouse/tocar, legenda e visão em tabela para conferência; em período de um dia, o valor aparece escrito no gráfico.
- **RF-12 — Alertas do dia** (na Análise do Período, com seletor de dia próprio e atalho "Hoje"):
  - Tabela **PSE acima de 6** (atleta, horário de envio, tipo, PSE, observações).
  - Tabela **PSR abaixo de 5 por atleta**, com as variáveis abaixo de 5 destacadas.
- **RF-13 — Cronograma semanal:** criar, editar e excluir treinos com data, horário de início e fim (opcional), nome, tipo, **PSE esperada (1–10)** e **anotações**.
  - Só é possível programar **a semana atual e a próxima**; a **semana passada** fica para consulta; treinos mais antigos são **apagados do banco** automaticamente.
  - Tocar num treino abre os detalhes com as anotações e o botão **"Editar treino"**.
  - Resumo da semana: número de treinos e PSE esperada média.
- **RF-14 — Atletas adversários:** cadastrar, editar e excluir adversários (nome, categoria de peso, classe de idade — juvenil/júnior/sênior —, origem por país ou clube e observação).
- **RF-15 — Gestão → Atletas:** cadastrar, editar e excluir atletas (nome, **CPF** obrigatório, válido e único na plataforma, classe, categoria, celular, sexo); busca por nome, CPF, categoria ou classe; **redefinir a senha do atleta** para a inicial.
- **RF-16 — Gestão → Treinadores (só admin):** cadastrar treinador (nome, e-mail, papel treinador/admin) com **senha temporária** mostrada uma única vez, com botões Copiar e WhatsApp; promover/rebaixar admin; desativar/reativar. O clube **nunca fica sem um admin ativo** e o admin não altera a própria conta.
- **RF-17 — Escudo do clube (só admin):** trocar o escudo (PNG, JPG, WEBP ou SVG, até 1 MB) clicando nele em Gestão → Treinadores.

### 3.3 Clubes e convites
- **RF-18 — Convite de clube:** um dono gera um link `…/?convite-clube=<código>` **preso ao e-mail do responsável**, válido por **7 dias** e de **uso único**.
- **RF-19 — Criação do clube:** pelo link, o responsável informa nome do clube, escudo (opcional), seu nome e senha (e-mail travado). O clube é criado vazio e o responsável vira **admin do clube** e entra direto no painel.
- **RF-20 — Separação por clube:** atletas, respostas, cronograma e adversários pertencem a um clube; cada treinador e atleta só vê e altera dados do próprio clube.
- **RF-21 — Bloqueio de cadastro sem convite:** toda conta nova de treinador exige convite válido para aquele e-mail (de clube ou interno do admin); cadastros abertos são recusados pelo banco. Exceção: os e-mails dos donos.

### 3.4 Área Restrita (donos da plataforma)
- **RF-22 — Acesso separado:** endereço próprio `/restrito`, sem link em nenhuma tela do app, com login e layout próprios; contas que não são de dono veem "Acesso negado".
- **RF-23 — Convites:** gerar convite de clube; listar convites pendentes, usados, expirados e cancelados; copiar o link de novo ou cancelar convites pendentes.
- **RF-24 — Clubes:** listar clubes com escudo, admins, número de treinadores e atletas; **suspender/reativar** (suspenso = treinadores e atletas sem acesso; dados preservados).
- **RF-25 — Modo suporte:** entrar num clube para **ver** os dados (Dia, Período, Agenda, Elenco, Adversários) **somente leitura**, por no máximo **2 horas**; botões de alteração ficam ocultos e o banco bloqueia qualquer escrita. Enquanto o suporte estiver ativo, o painel de treinador da mesma conta fica bloqueado até sair do suporte.
- **RF-26 — Registro de ações (LGPD):** convites, suspensões, reativações e entradas/saídas do modo suporte ficam registrados (data, dono, clube) e visíveis apenas para os donos.

---

## 4. Requisitos Não-Funcionais

- **RNF-01 Performance:** carregamento das telas e envio de formulários em até 2 segundos em 4G; consultas do período paginadas (o Supabase limita 1.000 linhas por consulta).
- **RNF-02 Disponibilidade:** compatível com o SLA do Supabase e da Vercel; sem requisito adicional nesta versão.
- **RNF-03 Segurança (banco):** RLS habilitado em todas as tabelas; **nenhum acesso anônimo direto às tabelas**. O atleta usa apenas funções do banco validadas por token de sessão; o treinador só acessa linhas do clube dele; escrita bloqueada em modo suporte; senhas de atletas com bcrypt (pgcrypto) em tabela sem acesso pela API.
- **RNF-04 Escalabilidade:** múltiplos clubes na mesma instância, até ~200 atletas ativos por clube, sem degradação perceptível.
- **RNF-05 LGPD:** dados de saúde/bem-estar (PSE/PSR) e pessoais (CPF, celular) acessíveis apenas ao próprio clube; acesso dos donos só em modo suporte, somente leitura, temporário e registrado; sem compartilhamento com terceiros.
- **RNF-06 Multi-tenant:** isolamento de dados por clube garantido no banco (não apenas na tela).
- **RNF-07 Responsividade:** todas as telas otimizadas para celular e desktop, sem rolagem horizontal.
- **RNF-08 Acessibilidade dos gráficos:** cores validadas para fundo escuro e daltonismo; séries diferenciadas também pelo formato do ponto; legenda e visão em tabela.

---

## 5. Integrações Necessárias

| Sistema | Tipo de Conexão | Dados Trocados | Status | Fase |
|---|---|---|---|---|
| Supabase Postgres | SDK `@supabase/supabase-js` + funções RPC | Clubes, treinadores, atletas, PSE, PSR, peso, cronograma, adversários, convites, registro | Disponível | Piloto |
| Supabase Auth | E-mail e senha | Login de treinadores, admins e donos (atletas usam login próprio por CPF) | Disponível | Piloto |
| Supabase Storage | Bucket público `escudos` | Escudos dos clubes | Disponível | Piloto |
| pg_cron (Supabase) | Agendamento no banco (opcional) | Limpeza semanal do cronograma antigo (o app também limpa ao abrir o cronograma) | Opcional | Piloto |
| Vercel | Deploy + variáveis de ambiente | Build estático; `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Disponível | Piloto |
| WhatsApp (link `wa.me`) | Link de compartilhamento | Envio manual de senha temporária e convites | Disponível | Piloto |
| Notificação (SMS/WhatsApp automático) | — | Lembrete de preenchimento | Pendente | Expansão |

---

## 6. Segurança e Privacidade

- **Isolamento por clube:** todas as tabelas de dados têm `club_id`; as regras de acesso usam o clube do treinador logado. Registros de PSE/PSR/peso herdam automaticamente o clube do atleta.
- **Atletas:** login por funções do banco; token de sessão de 30 dias; não há leitura anônima de atletas (CPF e celular protegidos); envio de respostas somente com sessão válida e senha já trocada.
- **Treinadores:** contas só criadas com convite válido (código secreto + e-mail, uso único, 15 minutos para cadastro interno e 7 dias para convite de clube); treinador desativado ou clube suspenso perde o acesso na hora.
- **Donos:** acesso administrativo apenas na Área Restrita; ações sensíveis via funções que verificam o e-mail de dono; modo suporte somente leitura, com expiração e registro.
- **Senhas:** atletas — bcrypt no banco, nunca expostas; treinadores e donos — Supabase Auth. Nenhuma senha fica em código, `.env` ou repositório.
- **Criptografia:** TLS em trânsito (Supabase/Vercel).
- **Observação:** o endereço `/restrito` não é a proteção principal (fica visível no código do app); a proteção efetiva é o banco.

---

## 7. Critérios de Aceite

Legenda: ✅ implementado e testado localmente (banco em Postgres local simulando o Supabase + navegador com dados simulados) — falta validar em produção.

**Atleta**
- ✅ Atleta não cadastrado, inativo ou de clube suspenso não entra; CPF/senha errados são recusados.
- ✅ Primeiro acesso exige troca de senha; nova senha igual à inicial é recusada.
- ✅ PSE, PSR e peso são salvos com a data local e no clube do atleta; nenhum registro sem sessão válida.
- ✅ Atleta vê apenas o cronograma do próprio clube e abre as anotações de cada treino.

**Treinador**
- ✅ Visão do dia mostra todas as PSE de cada atleta no dia.
- ✅ Análise do período: filtro De/Até e Hoje; média ↔ moda pelas setas; filtro de tipos; condensado/por tipo; PSE esperada por tipo; tabelas de alerta do dia.
- ✅ Cronograma limitado às semanas permitidas; treinos antigos apagados; detalhes com anotações e edição.
- ✅ Gestão: atletas (CPF válido e único) e treinadores (só admin), com senha temporária e troca obrigatória.
- ✅ O clube nunca fica sem admin; treinador comum não gerencia equipe.

**Plataforma**
- ✅ Um clube não vê, não cria e não altera dados de outro (atletas, respostas, cronograma, adversários, equipe).
- ✅ Cadastro sem convite, com convite de outro e-mail, vencido ou reutilizado é recusado.
- ✅ Convite de clube cria o clube vazio e o responsável como admin; escudo só na pasta do próprio clube.
- ✅ Área Restrita: só donos; suspender/reativar; modo suporte somente leitura, com expiração; registro de ações visível só aos donos.

**Produção (pendente)**
- [ ] SQL aplicados no Supabase (ordem na seção 9) e configurações de Auth ajustadas.
- [ ] Deploy na Vercel com as variáveis de ambiente.
- [ ] Teste ponta a ponta com o elenco real do Minas (login de atletas, convite de um treinador, um convite de clube de teste).

---

## 8. Roadmap de Versões

- **1.0 — MVP (concluída):** registro diário sem login; visão do dia e gestão de elenco; single tenant.
- **2.0 — Plataforma multi-clube (atual):** tudo descrito neste documento.
- **2.1 — Próximos ajustes sugeridos:**
  - Recuperação de senha pelo app e 2FA para os donos.
  - **Inativar** atleta pela tela (hoje só há excluir; o campo `active` já existe).
  - Guardar a PSE esperada diária antes da limpeza do cronograma, para comparação em períodos longos.
  - Opção de esconder anotações do treinador para os atletas (anotações hoje são visíveis ao elenco).
  - Histórico/gráficos individuais para o próprio atleta.
- **Fase 3 — Expansão:** lembretes automáticos (SMS/WhatsApp); cobrança/assinatura dos clubes; integrações com wearables.

---

## 9. Implantação (referência técnica)

**Banco de dados:** um único arquivo, `supabase_completo.sql`. Colar inteiro no SQL Editor do Supabase e rodar.
Serve para banco novo e para atualizar o atual, pode ser executado várias vezes e não apaga dados. Sempre que o arquivo mudar, rodar de novo inteiro.
Opcional: `supabase_dados_ficticios.sql` (50 atletas fictícios com PSE/PSR, removíveis).

**Configuração do Supabase (Authentication → Sign In / Providers):**
- "Allow new users to sign up": **ligado** (o banco barra cadastros sem convite).
- "Confirm email": **desligado**.
- Conta do dono sem cadastro: criar em Authentication → Users → Add user (com "Auto Confirm User").

**Vercel:** variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; gerar convites de clube pelo site publicado (o link usa o endereço de onde foi gerado).
