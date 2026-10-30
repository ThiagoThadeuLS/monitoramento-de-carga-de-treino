-- ============================================================
-- BANCO DE DADOS: MONITORAMENTO DE CARGA DE TREINO (SUPABASE)
-- ============================================================

-- Remove tabelas antigas se existirem (para recriar do zero)
drop table if exists public.pse_records cascade;
drop table if exists public.psr_records cascade;
drop table if exists public.weight_records cascade;
drop table if exists public.athletes cascade;

-- 1. TABELA DE ATLETAS
-- Colunas solicitadas: ID, nome, classe, categoria, celular, sexo
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  classe text,
  categoria text,
  celular text,
  sexo text,
  active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TABELA DE QUESTIONÁRIOS DE PSE (Percepção Subjetiva de Esforço - Foster)
create table public.pse_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  training_type text, -- 'Treino Técnico', 'Treino Randori', 'Treino Físico'
  did_not_train boolean default false not null,
  rpe_score integer check (rpe_score >= 1 and rpe_score <= 10 or rpe_score is null),
  observations text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TABELA DE QUESTIONÁRIOS DE PSR (Recuperação e Bem-Estar - 6 Sliders)
create table public.psr_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  psr_score integer not null check (psr_score >= 1 and psr_score <= 10),
  fatigue_score integer not null check (fatigue_score >= 1 and fatigue_score <= 10),
  sleep_score integer not null check (sleep_score >= 1 and sleep_score <= 10),
  muscle_soreness_score integer not null check (muscle_soreness_score >= 1 and muscle_soreness_score <= 10),
  stress_score integer not null check (stress_score >= 1 and stress_score <= 10),
  mood_score integer not null check (mood_score >= 1 and mood_score <= 10),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. TABELA DE CONTROLE DE PESO CORPORAL (Float)
create table public.weight_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete cascade not null,
  date date default current_date not null,
  weight numeric(5,2) not null check (weight >= 30 and weight <= 250),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- POLÍTICAS DE ACESSO (Row Level Security - RLS)
-- Permite que atletas enviem formulários SEM LOGIN
-- ============================================================

alter table public.athletes enable row level security;
alter table public.pse_records enable row level security;
alter table public.psr_records enable row level security;
alter table public.weight_records enable row level security;

-- Leitura pública de atletas ativos (para o seletor suspenso da tela)
create policy "Atletas visíveis para seleção anônima"
  on public.athletes for select
  using (active = true);

-- Inserção anônima para os 3 questionários dos atletas
create policy "Inserção anônima de PSE"
  on public.pse_records for insert
  with check (true);

create policy "Inserção anônima de PSR"
  on public.psr_records for insert
  with check (true);

create policy "Inserção anônima de Peso"
  on public.weight_records for insert
  with check (true);

-- Usuários autenticados (comissão técnica / treinador) têm acesso total
create policy "Acesso total a atletas para autenticados"
  on public.athletes for all
  to authenticated using (true);

create policy "Acesso total a PSE para autenticados"
  on public.pse_records for all
  to authenticated using (true);

create policy "Acesso total a PSR para autenticados"
  on public.psr_records for all
  to authenticated using (true);

create policy "Acesso total a Peso para autenticados"
  on public.weight_records for all
  to authenticated using (true);

-- ============================================================
-- ATLETAS INICIAIS DE EXEMPLO
-- ============================================================
insert into public.athletes (nome, classe, categoria, celular, sexo) values
  ('Gabriel Silva', 'A', 'Profissional', '(11) 98765-4321', 'Masculino'),
  ('Lucas Santos', 'B', 'Sub-20', '(11) 97654-3210', 'Masculino'),
  ('Mariana Oliveira', 'A', 'Profissional', '(21) 98888-7777', 'Feminino'),
  ('Felipe Costa', 'C', 'Sub-17', '(31) 99123-4567', 'Masculino'),
  ('Beatriz Almeida', 'A', 'Profissional', '(11) 98111-2222', 'Feminino'),
  ('Bruno Henrique', 'B', 'Sub-20', '(41) 99999-8888', 'Masculino'),
  ('Larissa Ferreira', 'A', 'Profissional', '(61) 98444-5555', 'Feminino'),
  ('Thiago Martins', 'B', 'Sub-20', '(11) 97777-6666', 'Masculino');
