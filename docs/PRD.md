# PRD — PRODUCT REQUIREMENT DOCUMENT

**Projeto:** App de Monitoramento de Atletas
**Cliente:** Uso interno (equipe/clube esportivo)
**Versão:** 1.0 **Data:** 2026-10-30 **PO:** Thiago Thadeu Leal Santos
**Status:** DRAFT

---

## 1. Visão do Produto

### 1.1 Problema que resolve
Comissões técnicas hoje controlam carga de treino, recuperação e peso dos atletas em planilhas manuais, alimentadas por relatos verbais ou formulários avulsos. Isso gera atraso na identificação de atletas em risco de fadiga/lesão e retrabalho de digitação para o treinador.

### 1.2 Solução proposta
Aplicativo web, e mobile que permite ao **atleta** registrar diariamente, após ser cadastrado pelo treinador, três indicadores padronizados de monitoramento de carga (PSE — Percepção Subjetiva de Esforço, PSR — Percepção Subjetiva de Recuperação, e peso corporal), e permite ao **treinador**, autenticado, visualizar esses dados e gerenciar o cadastro do elenco.

### 1.3 Usuários finais
- **Diretos:** atletas do clube (preenchem os formulários diários) e treinador/comissão técnica (consultas de dados e gráficos e gerencia o elenco e cronograma de treinos).
- **Técnicos:** o próprio PO/desenvolvedor mantém a infraestrutura (Supabase + Vercel).

### 1.4 Fora de escopo (nesta versão)
- **Multi-tenant**: o sistema atende apenas uma organização/clube por instância (single tenant). Arquitetura multi-clube é visão de expansão (seção 8), não faz parte do MVP.
- Notificações automáticas (SMS/WhatsApp) para o atleta, apesar do campo `celular` já existir no cadastro.
- Tela de histórico/gráficos de evolução individual para o próprio atleta (hoje só o treinador vê consolidado via "Visão Geral do Dia").
- Testes automatizados (não há suíte de testes no projeto atualmente).
- Qualquer integração com sistemas externos de performance/saúde (ex: GPS, wearables).

---

## 2. Objetivos e Métricas de Sucesso

| Métrica | Baseline Atual | Target MVP | Target 90 dias |
|---|---|---|---|
| Adesão diária dos atletas (registros/atleta ativo/dia de treino) | 0% (sem sistema) | ≥ 70% | ≥ 90% |
| Uso do app pelo treinador em vez de planilha | 0% | 100% das decisões diárias via app | 100% mantido |
| Tempo de consolidação dos dados do elenco pelo treinador | manual, minutos por atleta | Visão instantânea (dado já consolidado no app) | mantido |
| Taxa de registros com `athlete_id` inválido/órfão | indefinido (bug já identificado) | 0% | 0% |

---

## 3. Requisitos Funcionais

- **RF-01**: O atleta deve conseguir fazer login na sessão de atleta após ser cadastrado pelo seu trinador
- **RF-02**: O atleta deve conseguir registrar PSE diário: tipo de treino, RPE (1–10) ou marcar "não treinei", e observações. 
- **RF-03**: O atleta deve conseguir registrar PSR diário com as dimensões: percepção de recuperação, fadiga, sono, dor muscular, estresse e humor (todas 1–10).
- **RF-04**: O atleta deve conseguir registrar seu peso corporal (30–250 kg).
- **RF-05**: O sistema deve impedir o envio de formulários vinculados a um `athlete_id` que não exista mais na base de atletas ativos (evitar IDs órfãos salvos em `localStorage`). 
- **RF-06**: O sistema deve exibir uma mensagem de erro explícita ao atleta/treinador quando a lista de atletas não puder ser carregada do banco (sem mascarar com dados fictícios).
- **RF-07**: O treinador deve autenticar-se via e-mail e senha para acessar a área de gestão.
- **RF-08**: O treinador deve visualizar uma sessão destinada ao monitoramento com gráficos e tabelas.
- **RF-09**: O treinador deve conseguir cadastrar, editar e inativar atletas (nome, classe, categoria, celular, cpf, sexo). 
- **RF-10**: O sistema deve listar apenas atletas com `active = true` para seleção pelo atleta (atletas inativos não aparecem para autopreenchimento). — Prioridade: Média

---

## 4. Requisitos Não-Funcionais

- **RNF-01 Performance:** Carregamento da lista de atletas e envio de formulário em até 2 segundos em conexão 4G.
- **RNF-02 Disponibilidade:** Disponibilidade compatível com o SLA do Supabase (plano usado) e Vercel; sem requisito de alta disponibilidade adicional no MVP.
- **RNF-03 Segurança:** Row Level Security (RLS) habilitado em todas as tabelas; inserção anônima restrita apenas às tabelas de registro (`pse_records`, `psr_records`, `weight_records`); leitura/escrita de cadastro de atletas restrita a usuários autenticados.
- **RNF-04 Escalabilidade:** Suportar o elenco de um único clube (estimado até ~200 atletas ativos) sem degradação perceptível.
- **RNF-05 LGPD:** Dados de saúde/bem-estar (PSE/PSR) e dado pessoal (celular) tratados como sensíveis; acesso restrito a usuários autenticados (treinador); sem compartilhamento com terceiros.
- **RNF-06 Single Tenant:** A aplicação não deve pressupor isolamento de dados por organização nesta versão — todo o banco pertence a um único clube.

---

## 5. Integrações Necessárias

| Sistema | Tipo de Conexão | Dados Trocados | Status API | Fase |
|---|---|---|---|---|
| Supabase (Postgres + Auth) | SDK `@supabase/supabase-js` | CRUD de atletas e registros; autenticação de treinador | Disponível | Piloto |
| Vercel | Deploy/hosting + variáveis de ambiente | Build estático + env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | Disponível | Piloto |
| Notificação (SMS/WhatsApp) | — | Lembrete de preenchimento usando o campo `celular` já cadastrado | Pendente | Expansão |

---

## 6. Segurança e Privacidade

- Conformidade LGPD: dados de bem-estar/saúde do atleta tratados como dados sensíveis; acesso de leitura restrito a usuários autenticados (treinador).
- Plataforma: Supabase (Postgres gerenciado) com Row Level Security habilitado em `athletes`, `pse_records`, `psr_records`, `weight_records`.
- Criptografia: TLS em trânsito (padrão Supabase/Vercel); sem necessidade de criptografia adicional em repouso identificada no MVP.
- Acesso: apenas usuários com conta Supabase Auth (treinador/comissão técnica) acessam dados completos; atletas têm acesso de escrita anônima apenas aos próprios registros via seleção de nome.

---

## 7. Critérios de Aceite do MVP

- [ ] Atleta consegue registrar PSE, PSR e peso sem autenticação, com validação de `athlete_id` ativo
- [ ] Erro de carregamento da lista de atletas é visível e explícito (sem fallback silencioso para dados mock)
- [ ] Treinador autentica e visualiza a Visão Geral do Dia com dados reais do Supabase
- [ ] Treinador consegue cadastrar/editar/inativar atleta e essa mudança reflete na seleção do atleta
- [ ] Nenhum registro é salvo com `athlete_id` que não exista na base ativa
- [ ] RLS validado: tentativa anônima de leitura/escrita fora das tabelas de registro é bloqueada

---

## 8. Roadmap de Versões

- **Piloto / MVP (atual):** registro diário (PSE/PSR/Peso) pelo atleta sem login; login e visão geral diária + gestão de elenco pelo treinador; single tenant.
- **V1.1:** histórico/gráfico de evolução individual visível ao próprio atleta; correções de UX pós-piloto com elenco real.
- **Expansão (Fase 2):** notificação automática (SMS/WhatsApp) de lembrete de preenchimento; suporte multi-tenant (múltiplos clubes na mesma instância).
