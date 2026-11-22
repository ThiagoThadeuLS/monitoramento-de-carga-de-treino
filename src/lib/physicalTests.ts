// Testes físicos além do PR (tabela physical_tests): definições, validação e resumos.
// Contas puras, sem acesso ao banco (testadas em physicalTests.test.ts).

export type PhysicalTestKind = 'barra_reps' | 'barra_iso' | 'beep' | 'cmj';

export interface PhysicalTestDef {
  id: PhysicalTestKind;
  nome: string;
  /** Nome curto (tabelas e etiquetas) */
  curto: string;
  /** Unidade do valor principal */
  unidade: string;
  descricao: string;
  min: number;
  max: number;
  /** Só números inteiros (repetições, nível do beep) */
  inteiro: boolean;
}

export const PHYSICAL_TESTS: PhysicalTestDef[] = [
  {
    id: 'barra_reps',
    nome: 'Barra: repetições máximas',
    curto: 'Barra (rep.)',
    unidade: 'rep.',
    descricao: 'Quantas barras completas seguidas, sem soltar.',
    min: 0,
    max: 100,
    inteiro: true,
  },
  {
    id: 'barra_iso',
    nome: 'Barra: isometria máxima',
    curto: 'Barra isom.',
    unidade: 's',
    descricao: 'Tempo máximo segurando na barra, em segundos.',
    min: 1,
    max: 600,
    inteiro: false,
  },
  {
    id: 'beep',
    nome: 'Beep test',
    curto: 'Beep test',
    unidade: 'nível',
    descricao: 'Nível alcançado e o vaivém (shuttle) daquele nível.',
    min: 1,
    max: 21,
    inteiro: true,
  },
  {
    id: 'cmj',
    nome: 'CMJ (salto com contramovimento)',
    curto: 'CMJ',
    unidade: 'cm',
    descricao: 'Altura do salto, em centímetros.',
    min: 1,
    max: 120,
    inteiro: false,
  },
];

export const testDef = (kind: string): PhysicalTestDef | undefined => PHYSICAL_TESTS.find((t) => t.id === kind);

export interface PhysicalTestEntry {
  id: string;
  athlete_id?: string;
  teste: PhysicalTestKind;
  /** Dia do teste (AAAA-MM-DD) */
  data: string;
  valor: number;
  /** Beep test: vaivém dentro do nível (opcional) */
  estagio: number | null;
  created_at?: string;
}

/** Números chegam do banco como texto (numeric): converte e descarta testes desconhecidos. */
export function normalizeTests<T extends PhysicalTestEntry>(rows: T[]): T[] {
  return rows
    .filter((r) => testDef(r.teste))
    .map((r) => ({ ...r, valor: Number(r.valor), estagio: r.estagio === null || r.estagio === undefined ? null : Number(r.estagio) }));
}

/**
 * VO2máx estimado pelo beep test (fórmula de Flouris et al., 2005):
 * 3,46 × (nível + vaivém ÷ (nível × 0,4325 + 7,0048)) + 12,2, em ml/kg/min.
 */
export function estimateVo2(level: number, shuttle?: number | null): number {
  const s = shuttle ?? 0;
  return Math.round((3.46 * (level + s / (level * 0.4325 + 7.0048)) + 12.2) * 10) / 10;
}

/** Valor usado para comparar (melhor e evolução). No beep test conta o vaivém também. */
export function testScore(e: Pick<PhysicalTestEntry, 'teste' | 'valor' | 'estagio'>): number {
  return e.teste === 'beep' ? estimateVo2(e.valor, e.estagio) : e.valor;
}

const fmt = (v: number, digits = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: digits });

/** Texto do resultado: "12 rep.", "45 s", "Nível 10.5", "42,5 cm". */
export function formatTest(e: Pick<PhysicalTestEntry, 'teste' | 'valor' | 'estagio'>): string {
  switch (e.teste) {
    case 'barra_reps':
      return `${fmt(e.valor, 0)} rep.`;
    case 'barra_iso':
      return `${fmt(e.valor)} s`;
    case 'beep':
      return e.estagio ? `Nível ${fmt(e.valor, 0)}.${e.estagio}` : `Nível ${fmt(e.valor, 0)}`;
    case 'cmj':
      return `${fmt(e.valor)} cm`;
  }
}

/** Diferença entre dois resultados do mesmo teste, já com a unidade ("+2 rep.", "+1,5 ml/kg/min"). */
export function formatTestDiff(kind: PhysicalTestKind, diff: number): string {
  const sign = diff > 0 ? '+' : '';
  if (kind === 'beep') return `${sign}${fmt(diff)} VO2`;
  const def = testDef(kind)!;
  return `${sign}${fmt(diff, kind === 'barra_reps' ? 0 : 1)} ${def.unidade}`;
}

/** Confere o valor antes de enviar (o banco confere de novo). Devolve a mensagem de erro ou null. */
export function validateTest(kind: PhysicalTestKind, valor: number, estagio: number | null): string | null {
  const def = testDef(kind);
  if (!def) return 'Escolha o teste.';
  if (!Number.isFinite(valor)) return 'Informe o resultado.';
  if (valor < def.min || valor > def.max) return `O resultado precisa ficar entre ${def.min} e ${def.max} ${def.unidade}.`;
  if (def.inteiro && !Number.isInteger(valor)) return 'Use um número inteiro.';
  if (kind === 'beep') {
    if (estagio !== null && (!Number.isInteger(estagio) || estagio < 1 || estagio > 16)) return 'O vaivém vai de 1 a 16.';
  } else if (estagio !== null) {
    return 'Esse teste não tem vaivém.';
  }
  return null;
}

export interface TestSummary {
  teste: PhysicalTestKind;
  /** Do mais antigo para o mais novo */
  history: PhysicalTestEntry[];
  latest: PhysicalTestEntry;
  best: PhysicalTestEntry;
  /** Último menos o anterior (null com um registro só) */
  diff: number | null;
}

const byDate = (a: PhysicalTestEntry, b: PhysicalTestEntry) =>
  a.data.localeCompare(b.data) || (a.created_at ?? '').localeCompare(b.created_at ?? '');

/** Resumo por teste: último resultado, melhor e a diferença para o anterior. */
export function summarizeTests(entries: PhysicalTestEntry[]): Map<PhysicalTestKind, TestSummary> {
  const out = new Map<PhysicalTestKind, TestSummary>();
  for (const def of PHYSICAL_TESTS) {
    const history = entries.filter((e) => e.teste === def.id).sort(byDate);
    if (history.length === 0) continue;
    const latest = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const best = history.reduce((b, e) => (testScore(e) > testScore(b) ? e : b), history[0]);
    out.set(def.id, {
      teste: def.id,
      history,
      latest,
      best,
      diff: prev ? Math.round((testScore(latest) - testScore(prev)) * 10) / 10 : null,
    });
  }
  return out;
}
