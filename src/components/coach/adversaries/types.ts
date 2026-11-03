export type ClasseIdade = 'juvenil' | 'júnior' | 'sênior';
export type TipoOrigem = 'pais' | 'clube';
export type Sexo = 'masculino' | 'feminino';

export interface Adversario {
  id: string;
  club_id: string;
  nome: string;
  sexo: Sexo;
  categoria_peso: string;
  classe_idade: ClasseIdade;
  tipo_origem: TipoOrigem;
  origem_valor: string;
  criado_por_id?: string;
  criado_por_tipo?: 'atleta' | 'tecnico';
  /** só na lista do atleta: ele apagou esta ficha para si */
  oculto?: boolean;
}

export interface Observacao {
  id: string;
  adversario_id: string;
  autor_id: string;
  autor_tipo: 'atleta' | 'tecnico';
  texto: string;
  created_at: string;
}

/** Ficha sendo cadastrada (sem id) ou editada */
export type Draft = Omit<Adversario, 'id' | 'club_id'> & { id?: string; club_id?: string };

export const CLASSES: { id: ClasseIdade; label: string }[] = [
  { id: 'juvenil', label: 'Juvenil' },
  { id: 'júnior', label: 'Júnior' },
  { id: 'sênior', label: 'Sênior' },
];

export const CATEGORIAS_PESO: Record<Sexo, Record<ClasseIdade, string[]>> = {
  feminino: {
    juvenil: ['-44Kg', '-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '+70Kg'],
    júnior: ['-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '-78Kg', '+78Kg'],
    sênior: ['-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '-78Kg', '+78Kg'],
  },
  masculino: {
    juvenil: ['-55Kg', '-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '+90Kg'],
    júnior: ['-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '-100Kg', '+100Kg'],
    sênior: ['-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '-100Kg', '+100Kg'],
  },
};

export const newDraft = (): Draft => ({
  nome: '',
  sexo: 'masculino',
  classe_idade: 'sênior',
  categoria_peso: CATEGORIAS_PESO.masculino['sênior'][0],
  tipo_origem: 'clube',
  origem_valor: '',
});

export const initials = (nome: string) =>
  nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export const classeLabel = (c: ClasseIdade) => CLASSES.find((x) => x.id === c)?.label ?? c;

export const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500';

export const chipCls = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap flex-shrink-0 ${
    on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
  }`;

export const groupObservacoes = (list: Observacao[]) => {
  const grouped: Record<string, Observacao[]> = {};
  for (const obs of list) (grouped[obs.adversario_id] ??= []).push(obs);
  return grouped;
};

export const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
