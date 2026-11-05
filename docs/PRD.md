# PRD — PRODUCT REQUIREMENT DOCUMENT

**Projeto:** Plataforma de Monitoramento de Carga de Treino
**Cliente:** Clubes esportivos (piloto: Minas Tênis Clube — judô)
**Versão:** 2.2 **Data:** 2026-11-01 **PO:** Thiago Thadeu Leal Santos
**Status:** EM PRODUÇÃO (https://monitoramento-coral.vercel.app) — pendente validação ponta a ponta com o elenco real

> **Histórico de versões**
> - **1.0 (2026-10-30):** MVP single-tenant — atleta registra PSE/PSR/peso selecionando o nome em uma lista (sem login); treinador vê a Visão Geral do Dia e gerencia o elenco.
> - **2.0 (2026-10-31):** plataforma **multi-clube**; login do atleta por CPF; análise do período com gráficos; cronograma semanal; gestão de equipe com papéis; atletas adversários; Área Restrita dos donos da plataforma com modo suporte e registro de acessos.
> - **2.2 (2026-11-01):** **carga interna** (PSE × duração) com ACWR, monotonia e strain (aba Carga); **ficha individual** do atleta; **exportação** em CSV para Excel; **"esqueci minha senha"** para treinadores; **inativar** atleta mantendo o histórico; atleta vê o **próprio histórico** e corrige respostas do dia; **termo de consentimento (LGPD)** no primeiro acesso.
> - **2.1 (2026-11-01):** **grupos de atletas** e público de cada treino; motivo obrigatório no "não treinei"; **lembretes por notificação** (app instalável/PWA + Web Push) com horário definido pelo clube; no celular o sistema funciona **só como app instalado**; tabela **"Sem resposta no prazo"**; **cores do clube**; nova tela de **adversários**; **tour guiado** no primeiro acesso; revisão completa da responsividade; banco em **um único arquivo SQL**.

---

## 1. Visão do Produto

### 1.1 Problema que resolve
Comissões técnicas controlam carga de treino, recuperação e peso dos atletas em planilhas manuais, alimentadas por relatos verbais ou formulários avulsos. Isso atrasa a identificação de atletas em risco de fadiga/lesão, gera retrabalho de digitação, depende de o atleta lembrar de responder e não permite comparar o treino **planejado** com o treino **percebido** pelos atletas.

### 1.2 Solução proposta
Plataforma vendida para vários clubes, que funciona no navegador do computador e como **aplicativo instalado** no celular:
- o **atleta**, cadastrado pelo clube, entra com CPF e senha, registra PSE (esforço de cada treino), PSR (bem-estar) e peso, consulta os treinos destinados a ele e **recebe lembretes no celular** até responder;
- a **comissão técnica** acompanha o elenco (visão do dia, análise do período com gráficos, alertas e quem não respondeu), planeja a semana de treinos com PSE esperada e público (grupos/pessoas), define o horário dos lembretes e gerencia atletas, grupos, treinadores, adversários e as cores do clube;
- os **donos da plataforma** cadastram novos clubes por convite, suspendem/reativam clubes e prestam suporte em modo somente leitura, com registro de acessos.

Cada clube só enxerga os próprios dados.

### 1.3 Usuários e perfis de acesso

| Perfil | Como entra | O que pode fazer |
|---|---|---|
| **Atleta** | App instalado no celular (ou navegador no computador). CPF + senha (senha inicial = nome completo junto e minúsculo; troca obrigatória no 1º acesso). No celular, precisa permitir as notificações para usar | Aceitar o termo de uso dos dados; registrar PSE (com duração), PSR e peso; ver os treinos destinados a ele; ver o próprio histórico e corrigir respostas do dia; receber lembretes |
| **Treinador** | E-mail + senha (senha temporária gerada pelo admin; troca obrigatória no 1º acesso). No celular, pelo app instalado | Todo o painel do clube: dia, período (com exportação), carga interna, ficha do atleta, agenda (cronograma e horário dos avisos), adversários, gestão de atletas (inclusive inativar) e grupos. Recupera a senha por e-mail |
| **Admin do clube** | Igual ao treinador (o primeiro admin é quem cria o clube pelo convite) | Tudo do treinador + gestão de treinadores, escudo e **cores do clube** |
| **Dono da plataforma** | Área Restrita (`/restrito`), e-mail + senha; apenas `thiagothadeu11@gmail.com` e `gabrielalmeida99@gmail.com` | Convidar clubes, listar/suspender/reativar clubes, modo suporte (somente leitura) e registro de ações |
| **Técnico** | — | PO/desenvolvedor mantém a infraestrutura (Supabase + Vercel) |

### 1.4 Fora de escopo (nesta versão)
- Verificação em duas etapas (2FA).
- Exportação em formato .xlsx nativo (a exportação é CSV, que o Excel abre direto).
- Edição de respostas antigas pelo atleta (só as do próprio dia; as demais, pela comissão técnica a pedido).
- Notificações para a comissão técnica (decisão do PO: só atletas recebem).
- Lembretes por SMS/WhatsApp (os lembretes são notificações do app).
- Publicação nas lojas (Google Play / App Store) — o app é instalado pelo navegador (PWA).
- Cobrança/assinatura automática dos clubes (a suspensão é manual pelos donos).
- Integrações com sistemas externos de performance/saúde (GPS, wearables).
- Suíte de testes automatizados no repositório (os testes foram executados localmente, ver seção 7).

---

## 2. Objetivos e Métricas de Sucesso

| Métrica | Baseline | Target piloto | Target 90 dias |
|---|---|---|---|
| Adesão à PSE (respostas/atleta ativo/treino) | 0% (sem sistema) | ≥ 70% | ≥ 90% |
| Adesão à PSR (respostas/atleta ativo/dia de treino) | 0% | ≥ 70% | ≥ 90% |
| Respostas dentro do prazo (até o fim do horário de avisos do clube) | — | ≥ 70% | ≥ 85% |
| Atletas com o app instalado e notificações ativas | 0% | 100% dos atletas ativos (obrigatório no celular) | mantido |
| Uso do app pelo treinador em vez de planilha | 0% | 100% das decisões diárias via app | mantido |
| Treinos da semana planejados no cronograma (com PSE esperada) | 0% | ≥ 80% dos treinos | 100% |
| Registros com atleta inválido/órfão ou no clube errado | indefinido | 0% (garantido pelo banco) | 0% |
| Clubes ativos na plataforma | 1 (Minas) | 1 | ≥ 2 |

---

## 3. Requisitos Funcionais

### 3.1 Acesso pelo celular (atletas e treinadores)
- **RF-01 — Só app instalado no celular:** no celular, o sistema não funciona pelo navegador. Quem abre o link vê a tela **"Baixe o app"**: botão **Baixar app** no Android (ou passo a passo pelo menu ⋮ → Instalar app) e passo a passo no iPhone (Safari → Compartilhar → Adicionar à Tela de Início). No computador o sistema abre normalmente no navegador. Exceção: o link de convite de clube abre no navegador para criar a conta.
- **RF-02 — App instalado:** nome **Carga**, ícone próprio, tela cheia, sem barra do navegador. As notificações aparecem como notificação do aplicativo (não do Chrome), o que também evita que o Android as trate como possível spam de site.

### 3.2 Atleta
- **RF-03 — Login do atleta:** CPF + senha. Só atletas **cadastrados pelo clube, ativos e de clube ativo** entram. Não existe autocadastro.
- **RF-04 — Senha inicial e troca obrigatória:** a senha inicial é o nome completo, tudo junto e em minúsculas (acentos ignorados; ex.: "João Silva" → `joaosilva`). No primeiro acesso o atleta cria uma senha nova (mínimo 6 caracteres, diferente da inicial) antes de ver qualquer outra tela. A sessão fica salva no aparelho por até 30 dias.
- **RF-05 — Notificações obrigatórias no celular:** depois do login, o atleta só usa o app após **permitir as notificações**. A tela se adapta: botão "Permitir notificações"; passo a passo para liberar quando estão bloqueadas (com "Já liberei"); aviso para abrir no Chrome/Safari quando o navegador não aceita (ex.: navegador interno do WhatsApp/Instagram). A permissão fica **permanente no aparelho**: sair do app não desativa, e ao entrar de novo o aparelho é religado ao atleta sem perguntar. No computador os lembretes são opcionais (cartão "Ativar lembretes").
- **RF-06 — PSE:** tipo de treino (Técnico, Randori, Físico), **duração em minutos**, PSE de 1 a 10 (escala de Foster) e observações. O tipo e a duração já vêm preenchidos pelo treino de hoje no cronograma (o atleta pode ajustar; atalhos 60/90/120 min; 1 a 600 min). Se ficar em branco, o banco usa a duração do treino programado. Pode registrar **mais de uma PSE no mesmo dia** (uma por treino). Ao marcar **"Não treinei", o motivo é obrigatório** (validado também no banco para respostas novas).
- **RF-07 — PSR:** recuperação, fadiga, sono, dor muscular, estresse e humor (1 a 10 cada; nota baixa = pior).
- **RF-08 — Peso:** peso corporal (30 a 250 kg).
- **RF-09 — Data correta:** os registros usam a data local do aparelho.
- **RF-10 — Agenda (somente leitura):** treinos da semana passada, da atual e da próxima **destinados ao atleta** (conforme o público de cada treino). Tocar num treino abre detalhes e as **anotações do treinador**.
- **RF-11 — Identidade do clube:** cabeçalho com nome e escudo do clube e as **cores do clube**. O perfil do atleta mostra a **foto** (ou as iniciais do nome quando não houver foto). O atleta troca a própria foto tocando nela no app; a comissão técnica também pode trocar.
- **RF-12 — Lembretes (notificações):** sempre no horário de Brasília e **somente dentro do horário de avisos definido pelo clube** (padrão 06:00–22:00):
  - **PSR:** a partir do **início** do horário de avisos, nos dias em que o atleta tem treino; repete **a cada 20 min** até responder.
  - **PSE:** **20 min após o fim de cada treino** destinado ao atleta (sem horário de fim: início + 1h30); repete **a cada 20 min** até responder aquele treino ("não treinei" encerra os lembretes do dia).
  - **Peso:** nos dias e horário de pesagem do clube; repete a cada 30 min até registrar.
  - Só recebe quem já criou a própria senha e tem o aparelho cadastrado; o aviso repetido substitui o anterior; tocar na notificação abre a aba certa.

- **RF-12a — Termo de consentimento (LGPD):** no primeiro acesso (depois de criar a senha), o atleta lê e aceita o termo de uso dos dados — quem trata, quais dados (inclusive dados de saúde), finalidade, quem acessa, armazenamento, direitos e regra para menores de 18 anos — antes de usar o app. O aceite (data e versão) fica registrado e o banco recusa envios de quem não aceitou. Mudando a versão do termo, todos aceitam de novo. O termo pode ser relido no Histórico.
- **RF-12b — Histórico do atleta:** aba **Histórico** com as próprias respostas e gráficos de PSE/PSR, carga diária e peso (7, 30 ou 90 dias). Respostas **do próprio dia** podem ser **corrigidas** (apaga e abre o formulário para enviar de novo) ou **apagadas**; dias anteriores não podem ser alterados pelo atleta.
- **RF-12c — Compartilhar conquistas (Stories):** o atleta gera uma imagem vertical (1080 × 1920) com a própria foto, o escudo do clube, as cores do clube e o rodapé "feito com Monitoramento de Carga", e o botão **Compartilhar** abre a janela de compartilhar do celular (Instagram, WhatsApp...; no computador, a imagem é salva). Cartões: **novo recorde** (abre sozinho quando o PR sobe; cada PR também tem o botão), **sequência de dias** (dias de treino com resposta; dia sem treino não quebra), **resumo da semana** (aviso no domingo e na segunda) e **do mês** (aviso nos 3 primeiros dias), **contagem para a competição** e **selos** (7/30/100 dias seguidos, primeiro mês completo = 4 semanas seguidas com resposta, 10/50/100/250/500 treinos, peso no limite em 4 e 12 pesagens seguidas). **Foto pós-treino:** ao enviar a PSE de um treino (ou pelo botão **Postar** dos treinos respondidos na tela Hoje), o atleta tira uma foto com a câmera do celular (ou escolhe da galeria) e o app põe por cima a figurinha do treino: nome, horário, duração, a PSE dada (com o nome e a cor da escala), a PSE esperada pelo treinador, o escudo e a marca. Dá para arrastar a foto e a figurinha, mudar o tamanho, escolher escura ou clara e esconder as notas; sai no formato de Story. (Abrir a câmera do próprio Instagram já com a figurinha só é possível em app nativo registrado no Facebook.) As imagens são feitas no aparelho e só saem dele se o atleta escolher; os cartões nunca mostram PSE, PSR, dor nem o valor do peso, e a figurinha do treino só mostra a PSE se o atleta quiser. Dados: `athlete_achievements` (parte 17 do SQL, só leitura).

### 3.3 Treinador — painel do clube
Abas: **Dia, Período, Carga, Agenda, Adversários, Gestão**.

- **RF-13 — Login do treinador:** e-mail + senha, com **"Esqueci minha senha"**: o treinador informa o e-mail e recebe um link (válido por 1 hora) que abre a tela para criar a senha nova e entra no painel; a resposta é a mesma com ou sem conta (não revela quem está cadastrado); link vencido mostra aviso para pedir outro. O link funciona também no navegador do celular. Contas sem clube, desativadas ou de clube suspenso não veem dados (mensagem explicando o motivo). Treinador criado com senha temporária troca a senha no primeiro acesso (mínimo 8 caracteres).
- **RF-14 — Dia:** para a data e a seleção de atletas (grupos/pessoas), mostra por atleta **todas as PSE do dia** (nota, tipo e horário), a PSR, o peso e alertas (dor muscular, fadiga alta, esforço máximo), com cartões-resumo. No celular, um card por atleta; no computador, tabela.
- **RF-15 — Período — filtros e exportação:** **De/Até** com atalhos Hoje, 7, 15 e 30 dias (máximo 1 ano); **grupos e/ou pessoas específicas** (vale para toda a tela); tipos de treino; modo **condensado** ou **por tipo**. Botão **Exportar** baixa planilhas CSV (abrem no Excel em português) de **PSE e carga**, **PSR** ou **peso**, respeitando o período e os atletas escolhidos.
- **RF-16 — Período — gráficos:** PSE por dia com setas para alternar **média** e **moda**; **PSE esperada** do cronograma (por tipo no modo por tipo), com a diferença respondida × esperada; média de PSR por dia; detalhe ao tocar, legenda e visão em tabela.
- **RF-17 — Sem resposta no prazo:** tabela de quem **não respondeu PSR** (dias com treino) ou **PSE de cada treino** até o **fim do horário de avisos** do clube; quem respondeu depois aparece como **Atrasado** (com data/hora do envio, podendo ser ocultado). Considera só dias cujo prazo já passou e respeita o período e a seleção.
- **RF-18 — Alertas de um dia** (seletor de dia próprio): **PSE acima de 6**; **Não treinaram** (tocar abre o motivo); **PSR abaixo de 5 por atleta**, com as variáveis abaixo de 5 destacadas.
- **RF-18a — Carga interna (aba Carga):** carga da sessão = **PSE × duração (min)** em UA (método de Foster). Para uma data de referência e uma seleção de atletas: **carga aguda** (7 dias), **crônica** (média semanal de 28 dias), **ACWR** (aguda ÷ crônica; zonas: abaixo de 0,8, ideal 0,8–1,3, atenção 1,3–1,5, risco acima de 1,5), **monotonia** (média ÷ desvio-padrão diário da semana; alerta acima de 2) e **strain** (aguda × monotonia). Cartões-resumo (carga média, ACWR do grupo, atletas em risco, monotonia alta), gráficos de carga média diária e ACWR do grupo (28 dias, com faixas de referência), tabela por atleta ordenável e exportável, aviso de PSE sem duração e marcação de atletas com menos de 3 semanas de dados. Explicação "Como ler os indicadores".
- **RF-18b — Ficha do atleta:** aberta pelo Dia, pela Carga ou pela Gestão. Mostra classe/categoria, situação (ativo/inativo), termo aceito ou pendente, indicadores atuais (carga 7 dias, ACWR, monotonia/strain, peso atual e variação), gráficos de **carga diária, ACWR, PSE e PSR e peso** (30, 60 ou 90 dias), lista de faltas com motivo e **exportação CSV** de todas as respostas do atleta no período.
- **RF-19 — Agenda — cronograma:** criar, editar e excluir treinos com data, horário de início e fim, nome, tipo, **PSE esperada (1–10)**, **anotações** e **para quem**: **todos**, **somente** (grupos e/ou pessoas) ou **todos exceto**. Só a semana atual e a próxima podem ser programadas; a semana passada fica para consulta; treinos mais antigos são **apagados** automaticamente.
- **RF-20 — Agenda — horário dos avisos e pesagem:** o treinador define **das … às …** (início antes do fim) e os **dias e horário do lembrete de pesagem**. O fim do horário também é o prazo da tabela "Sem resposta".
- **RF-20a — Preparação física — modelos de ficha:** o treinador monta **fichas prontas** em blocos (ex.: Aquecimento, Força, Potência) arrastando os exercícios do catálogo (mouse ou dedo; setas de subir/descer como alternativa), com séries, repetições, % do PR e observação. Na ficha de um treino: **Usar modelo** (adiciona no fim ou substitui a ficha) e **Salvar como modelo**. Usar um modelo **copia** os exercícios: editar o modelo depois não muda os treinos que já o usaram. Também dá para duplicar e excluir modelos. A ficha do atleta segue a ordem montada (`posicao`; fichas antigas ficam na ordem de cadastro). Tabela `workout_templates` (parte 18 do SQL).
- **RF-21 — Adversários:** cards com iniciais, categoria de peso, classe (juvenil/júnior/sênior) e origem (clube nacional ou país); busca por nome, categoria, clube, país ou observação; filtros por classe e nacional/internacional; ficha completa ao tocar; cadastro e edição em janela; exclusão com confirmação.
- **RF-22 — Gestão → Atletas:** cadastrar, editar e excluir (nome, **CPF** obrigatório, válido e único na plataforma, classe, categoria, celular, sexo); busca; **redefinir a senha** para a inicial; abrir a **ficha**; adicionar, trocar ou remover a **foto** do atleta (qualquer imagem que o navegador abra; é recortada e reduzida para 512 px antes de subir, e cada pessoa fica com uma foto só). Excluir o atleta apaga também a foto. **Inativar/reativar**: o inativo não entra no app nem recebe lembretes e some das listas, mas o histórico é mantido (filtro "Mostrar inativos"). Excluir avisa que apaga todo o histórico. Selos **Inativo** e **Termo pendente**.
- **RF-23 — Gestão → Grupos:** criar, renomear e excluir grupos e escolher os participantes; **um atleta pode estar em vários grupos**. Usados no público dos treinos e nos filtros.
- **RF-24 — Gestão → Treinadores (só admin):** cadastrar treinador com **senha temporária** (mostrada uma vez, com Copiar e WhatsApp); promover/rebaixar admin; desativar/reativar. O clube **nunca fica sem admin ativo**; o admin não altera a própria conta. Troca do **escudo** (PNG, JPG, WEBP ou SVG, até 1 MB) e da **foto de cada treinador** (cada um troca a própria no cabeçalho; o admin também pode trocar a dos colegas).
- **RF-25 — Gestão → Cores (só admin):** 8 **paletas prontas** ou **personalizada** (cor principal e cor de fundo em hexadecimal, com seletor). Prévia ao vivo, aviso de fundo claro demais ou pouco contraste, "Voltar ao padrão". Vale para todos os treinadores e atletas do clube e fica guardada no aparelho para abrir já com as cores.

### 3.4 Tour guiado (atletas e treinadores)
- **RF-26 — Tour no primeiro acesso:** na primeira entrada de cada pessoa (registrado no banco, vale em qualquer aparelho), um tour escurece a tela, **destaca a parte real** que está explicando e troca de aba sozinho. Atleta (9 passos): perfil, abas, PSR, PSE, peso, agenda, regras dos lembretes, botão de ajuda. Treinador (18 passos): painel, abas, Dia, Período (filtros, gráficos, sem resposta, alertas), Agenda (avisos e cronograma), Adversários, Gestão (atletas, grupos e — para admin — treinadores e cores). Pode ser pulado; não altera dados.
- **RF-27 — Rever o tour:** botão discreto **"?"** no canto inferior direito abre o tour a qualquer momento.

### 3.5 Clubes e convites
- **RF-28 — Convite de clube:** um dono gera um link `…/?convite-clube=<código>` **preso ao e-mail do responsável**, válido por **7 dias** e de **uso único**.
- **RF-29 — Criação do clube:** pelo link, o responsável informa nome do clube, escudo (opcional), seu nome e senha (e-mail travado). O clube é criado vazio e o responsável vira **admin**.
- **RF-30 — Separação por clube:** atletas, respostas, grupos, cronograma, adversários, lembretes e cores pertencem a um clube; cada treinador e atleta só vê e altera dados do próprio clube.
- **RF-31 — Bloqueio de cadastro sem convite:** toda conta nova de treinador exige convite válido para aquele e-mail; cadastros abertos são recusados pelo banco. Exceção: os e-mails dos donos.

### 3.6 Área Restrita (donos da plataforma)
- **RF-32 — Acesso separado:** endereço próprio `/restrito`, sem link no app, com login e layout próprios; quem não é dono vê "Acesso negado".
- **RF-33 — Convites:** gerar, listar (pendentes, usados, expirados, cancelados), copiar o link de novo e cancelar.
- **RF-34 — Clubes:** listar com escudo, admins, número de treinadores e atletas; **suspender/reativar** (suspenso = sem acesso; dados preservados).
- **RF-35 — Modo suporte:** ver os dados de um clube **somente leitura**, por no máximo **2 horas**; o banco bloqueia qualquer escrita; o painel de treinador da mesma conta fica bloqueado até sair do suporte.
- **RF-36 — Registro de ações (LGPD):** convites, suspensões, reativações e entradas/saídas do suporte registrados (data, dono, clube), visíveis só para os donos.

---

## 4. Requisitos Não-Funcionais

- **RNF-01 Performance:** telas e envios em até 2 s em 4G; consultas do período paginadas (limite de 1.000 linhas por consulta do Supabase).
- **RNF-02 Disponibilidade:** SLA do Supabase e da Vercel. Lembretes verificados a cada 5 minutos (atraso máximo de ~5 min em relação ao horário previsto).
- **RNF-03 Segurança (banco):** RLS em todas as tabelas; nenhum acesso anônimo direto às tabelas; atleta só por funções validadas por token de sessão; escrita bloqueada em modo suporte; senhas de atletas com bcrypt.
- **RNF-04 Escalabilidade:** múltiplos clubes na mesma instância, até ~200 atletas ativos por clube.
- **RNF-05 LGPD:** dados de saúde/bem-estar e pessoais acessíveis apenas ao próprio clube; acesso dos donos só em suporte, somente leitura, temporário e registrado.
- **RNF-06 Multi-tenant:** isolamento por clube garantido no banco.
- **RNF-07 Responsividade:** todas as telas funcionam de 320 px até desktop **sem rolagem horizontal e sem texto vazando das caixas** (validado em 320, 360, 375, 390 e 412 px com nomes longos); a página não desliza para o lado no celular.
- **RNF-08 Acessibilidade dos gráficos:** cores validadas para fundo escuro e daltonismo; séries diferenciadas pelo formato do ponto; legenda e visão em tabela.
- **RNF-09 App instalável (PWA):** manifesto, ícones, service worker e área segura do iPhone. O app sempre carrega a versão mais nova do site (sem cache de páginas).
- **RNF-10 Notificações no iPhone:** exigem iOS 16.4+ e app adicionado à Tela de Início (limitação da Apple).

---

## 5. Integrações Necessárias

| Sistema | Tipo de Conexão | Dados Trocados | Status | Fase |
|---|---|---|---|---|
| Supabase Postgres | SDK `@supabase/supabase-js` + funções RPC | Clubes, treinadores, atletas, PSE, PSR, peso, grupos, cronograma, adversários, lembretes, cores, convites, registro | Disponível | Piloto |
| Supabase Auth | E-mail e senha | Login de treinadores, admins e donos (atletas usam login próprio por CPF) | Disponível | Piloto |
| Supabase Storage | Buckets públicos `escudos` e `fotos` | Escudos dos clubes e fotos de atletas/treinadores (imagens reduzidas no navegador, ~30–80 KB cada) | Disponível | Piloto |
| Supabase Edge Function `enviar-lembretes` | HTTP (Deno) + biblioteca `web-push` | Busca lembretes vencidos e envia as notificações; remove aparelhos inválidos | Disponível | Piloto |
| Supabase Edge Function `foto-atleta` | HTTP (Deno) | Foto do próprio atleta: confere a sessão do app e grava a foto na pasta dele (o atleta não tem login do Supabase) | A publicar | Piloto |
| pg_cron + pg_net (Supabase) | Agendamento no banco | Chama `enviar-lembretes` a cada 5 min (o cronograma guarda todos os treinos; não há limpeza automática) | Disponível | Piloto |
| Web Push (FCM / Apple / Mozilla) | Protocolo Web Push com chaves VAPID | Notificações para os aparelhos dos atletas | Disponível | Piloto |
| Vercel | Deploy pela CLI + variáveis de ambiente | Build estático; `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` | Disponível | Piloto |
| WhatsApp (link `wa.me`) | Link de compartilhamento | Envio manual de senha temporária e convites | Disponível | Piloto |

---

## 6. Segurança e Privacidade

- **Isolamento por clube:** todas as tabelas de dados têm `club_id`; regras de acesso pelo clube do treinador logado; PSE/PSR/peso herdam o clube do atleta.
- **Atletas:** login por funções do banco; token de 30 dias; CPF e celular protegidos; envio de respostas e cadastro do aparelho só com sessão válida e senha já trocada.
- **Treinadores:** contas só com convite válido (código secreto + e-mail, uso único); treinador desativado ou clube suspenso perde o acesso na hora. Cores do clube só alteradas pelo admin.
- **Donos:** ações administrativas só na Área Restrita, por funções que verificam o e-mail de dono; suporte somente leitura, com expiração e registro.
- **Notificações:** a chave privada VAPID fica **só** nos segredos da função no Supabase (nunca no código, no repositório ou na Vercel); as funções que listam e marcam lembretes só podem ser chamadas com a chave de serviço; endereços de aparelho só `https`; aparelhos que deixam de existir são removidos.
- **Senhas:** atletas — bcrypt no banco; treinadores e donos — Supabase Auth. Nenhuma senha em código ou repositório.
- **Criptografia:** TLS em trânsito; conteúdo das notificações criptografado ponta a ponta pelo protocolo Web Push.
- **Observação:** o endereço `/restrito` não é a proteção principal; a proteção efetiva é o banco.

---

## 7. Critérios de Aceite

Legenda: ✅ implementado e testado (banco em Postgres local simulando o Supabase + navegador com dados simulados); 🟢 conferido em produção.

**Celular e notificações**
- ✅ No celular pelo navegador aparece só "Baixe o app"; no computador abre normal.
- ✅ No celular, o atleta só usa o app depois de permitir as notificações; sair mantém o aparelho cadastrado; entrar de novo não pergunta.
- ✅ PSR sai no início do horário de avisos e repete a cada 20 min; PSE sai 20 min após o fim do treino e repete a cada 20 min; nada fora do horário do clube.
- 🟢 Função `enviar-lembretes` publicada e agendamento executando a cada 5 min.
- [ ] Notificação recebida em Android e iPhone reais com o app instalado.

**Novas funções (2.2)**
- ✅ PSE guarda a duração (informada ou a do treino programado; 1–600 min; "não treinei" sem duração); carga = PSE × minutos.
- ✅ Aba Carga: ACWR, monotonia e strain por atleta e do grupo; atleta com carga alta na última semana aparece em risco; exportação.
- ✅ Ficha do atleta com gráficos de carga, ACWR, PSE/PSR e peso e exportação CSV.
- ✅ Exportação CSV de PSE, PSR e peso no Período (separador ";", vírgula decimal, acentos corretos).
- ✅ "Esqueci minha senha" envia o pedido ao Supabase e o link abre a tela de nova senha (link vencido mostra aviso).
- ✅ Inativar mantém o histórico e bloqueia o acesso do atleta.
- ✅ Termo: sem aceite o banco recusa os envios; aceite registrado com data e versão.
- ✅ Histórico do atleta; corrigir/apagar só respostas do próprio dia e só as próprias.
- [ ] Teste do e-mail de redefinição de senha em produção (depende do envio de e-mails do Supabase).

**Atleta**
- ✅ Atleta não cadastrado, inativo ou de clube suspenso não entra; CPF/senha errados recusados.
- ✅ Primeiro acesso exige troca de senha.
- ✅ "Não treinei" sem motivo é recusado (tela e banco).
- ✅ Agenda mostra só os treinos destinados ao atleta.

**Treinador**
- ✅ Dia mostra todas as PSE de cada atleta; no celular, em cards.
- ✅ Período: filtros de datas, grupos/pessoas e tipos; média ↔ moda; PSE esperada; tabela "Sem resposta" (não respondeu × atrasado); alertas do dia com motivo de quem não treinou.
- ✅ Cronograma com público (todos / somente / exceto); semanas permitidas; limpeza dos antigos.
- ✅ Horário de avisos: início depois do fim é recusado (tela e banco).
- ✅ Grupos: atleta em vários grupos; grupos de outro clube recusados.
- ✅ Cores: prévia, salvar (só admin), cor inválida recusada, mantida ao reabrir.
- ✅ Tour abre no primeiro acesso, passa por todas as telas, é registrado como visto e reabre pelo "?".

**Plataforma**
- ✅ Um clube não vê, não cria e não altera dados de outro.
- ✅ Cadastro sem convite, com convite de outro e-mail, vencido ou reutilizado é recusado.
- ✅ `supabase_completo.sql` roda em banco novo e em banco existente, mais de uma vez, sem apagar dados (49 verificações).
- ✅ `supabase_zerar_banco.sql`: com a trava ligada não apaga nada; zera tudo menos os owners e as contas deles; o owner entra e convida o clube piloto; rodar o `supabase_completo.sql` de novo não recria o clube de teste (30 verificações).
- ✅ Nenhuma tela com rolagem horizontal ou texto vazando (320–412 px).
- 🟢 SQL aplicado no Supabase e site publicado na Vercel.
- [ ] Teste ponta a ponta com o elenco real do Minas.

---

## 8. Roadmap de Versões

- **1.0 — MVP (concluída):** registro diário sem login; visão do dia e gestão de elenco; single tenant.
- **2.0 — Plataforma multi-clube (concluída).**
- **2.1 — Lembretes, grupos e app (atual):** tudo descrito neste documento.
- **2.2 — Carga interna e dados do atleta (atual):** carga interna e ACWR, ficha do atleta, exportação, esqueci minha senha, inativar, histórico e correção pelo atleta, termo LGPD.
- **2.3 — Próximos passos sugeridos:**
  - 2FA para os donos da plataforma.
  - E-mails pelo próprio domínio do produto (SMTP próprio no Supabase), para não depender do limite do e-mail padrão.
  - Guardar a PSE esperada diária antes da limpeza do cronograma, para comparação em períodos longos.
  - Opção de esconder anotações do treinador para os atletas.
  - Revisão jurídica do texto do termo de consentimento.
- **Fase 3 — Expansão:** publicação nas lojas (se necessário); cobrança/assinatura dos clubes; integrações com wearables.

---

## 9. Implantação (referência técnica)

**Banco de dados:** um único arquivo, `supabase_completo.sql`. Colar inteiro no SQL Editor do Supabase e rodar.
Serve para banco novo e para atualizar o atual, pode ser executado várias vezes e não apaga dados. Sempre que o arquivo mudar, rodar de novo inteiro. O clube de teste (Minas, id fixo) só é criado na primeira execução em banco novo.
Só em banco de teste: `supabase_dados_ficticios.sql` (36 atletas fictícios com 8 semanas de PSE, PSR e peso, removíveis).

**Zerar para o piloto (feito; o script foi removido do repositório depois do início do piloto e está no histórico do git):** `supabase_zerar_banco.sql` apagava todos os dados e mantinha só o que é dos owners (`platform_owners`, as contas de login deles e o registro de acessos da Área Restrita). Tinha trava (trocar `'NAO'` por `'SIM'`), rodava tudo ou nada e mostrava a contagem de cada tabela no fim. Era para usar uma vez, antes do piloto; depois, o clube piloto entra pelo convite da Área Restrita. Escudos e fotos enviados nos testes são apagados pelo painel (Storage → `escudos` e `fotos`).

**Configuração do Supabase (Authentication → Sign In / Providers):**
- "Allow new users to sign up": **ligado** (o banco barra cadastros sem convite).
- "Confirm email": **desligado**.
- Conta do dono sem cadastro: criar em Authentication → Users → Add user (com "Auto Confirm User").

**"Esqueci minha senha" (Authentication → URL Configuration):**
- **Site URL:** `https://monitoramento-coral.vercel.app`.
- **Redirect URLs:** incluir `https://monitoramento-coral.vercel.app/**` (e `http://localhost:5173/**` para testes locais).
- O e-mail padrão do Supabase tem limite baixo de envios por hora; para uso real, configurar SMTP próprio (Authentication → Emails → SMTP Settings).

**Ordem de publicação:** rodar o `supabase_completo.sql` **antes** de publicar o app (o app novo usa o termo, a duração da PSE e o histórico).

**Lembretes (uma vez):**
- Extensões `pg_cron` e `pg_net` ativas (Database → Extensions).
- Função `enviar-lembretes` publicada (código em `supabase/functions/enviar-lembretes`, `verify_jwt = false`) com os segredos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`.
- Função `foto-atleta` publicada (código em `supabase/functions/foto-atleta`, `verify_jwt = false`): `npx supabase functions deploy foto-atleta --no-verify-jwt`.
- Agendamento `cron.schedule('enviar-lembretes', '*/5 * * * *', …)` — comando no fim da parte 7 do `supabase_completo.sql`.

**Vercel:** variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY`; publicação pela CLI (`vercel deploy --prod`). Gerar convites de clube pelo site publicado (o link usa o endereço de onde foi gerado).
