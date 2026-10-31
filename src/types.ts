export interface Athlete {
  id: string;
  nome: string;
  cpf?: string | null; // só números (11 dígitos)
  classe?: string;
  categoria?: string;
  celular?: string;
  sexo?: string;
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
  created_at?: string;
  updated_at?: string;
}
