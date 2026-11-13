export interface Athlete {
  id: string;
  nome: string;
  cpf?: string | null; // só números (11 dígitos)
  classe?: string;
  categoria?: string;
  celular?: string;
  sexo?: string;
  /** Foto do atleta no Storage (bucket público "fotos") */
  photo_url?: string | null;
  active?: boolean;
  created_at?: string;
}

export interface PseRecord {
  id?: string;
  athlete_id: string;
  date: string;
  training_type?: string; // 'Treino Técnico' | 'Treino Randori' | 'Treino Físico'
  rpe_score: number | null; // 1-10 (null if did_not_train)
  did_not_train: boolean;
  observations?: string;
  /** Duração do treino em minutos (carga = PSE x minutos) */
  duration_minutes?: number | null;
  created_at?: string;
}

export interface PsrRecord {
  id?: string;
  athlete_id: string;
  date: string;
  psr_score: number;        // 1-10
  fatigue_score: number;    // 1-10
  sleep_score: number;      // 1-10
  muscle_soreness_score: number; // 1-10
  stress_score: number;     // 1-10
  mood_score: number;       // 1-10
  created_at?: string;
}

export interface WeightRecord {
  id?: string;
  athlete_id: string;
  date: string;
  weight: number;           // float in kg (ex: 78.5)
  created_at?: string;
}

export interface TrainingSession {
  id: string;
  date: string;            // AAAA-MM-DD
  start_time: string;      // HH:MM[:SS]
  end_time?: string | null;
  name: string;
  training_type: string;   // mesmo tipo usado na PSE do atleta
  expected_pse: number;    // 1-10
  notes?: string | null;
  /** Anotações só para a comissão: o atleta não recebe o texto */
  hide_notes?: boolean;
  /** Público: todos | somente (incluir) | todos exceto (exceto) */
  audience?: 'todos' | 'incluir' | 'exceto';
  target_group_ids?: string[];
  target_athlete_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

/** Competição ou treinamento de campo cadastrado pela comissão técnica. */
export interface Competition {
  id: string;
  nome: string;
  /** 'competicao' (padrão) ou 'campo' = treinamento de campo (sem pesagem, com início e fim). */
  tipo?: 'competicao' | 'campo';
  /** Data da competição ou início do treinamento de campo (AAAA-MM-DD). */
  data: string;
  /** Último dia do treinamento de campo (null = um dia só). Competições não usam. */
  data_fim?: string | null;
  /** Data da pesagem oficial (AAAA-MM-DD). Treinamento de campo não tem (null). */
  data_pesagem: string | null;
  hora_pesagem?: string | null;
  local?: string | null;
  observacoes?: string | null;
  /** Mesmo público dos treinos (todos, somente, todos exceto) ou ninguém (antes da convocação). */
  audience?: 'todos' | 'incluir' | 'exceto' | 'ninguem';
  target_group_ids?: string[];
  target_athlete_ids?: string[];
  created_at?: string;
  updated_at?: string;
}
