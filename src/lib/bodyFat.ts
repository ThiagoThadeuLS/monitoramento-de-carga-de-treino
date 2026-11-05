/**
 * Composição corporal pelas dobras cutâneas de Jackson & Pollock (1978), protocolo de 7 dobras.
 * O cálculo usa a soma das 7 dobras (mm), a idade e o sexo; a massa magra e a gordura usam o peso.
 * Mesmas contas da planilha de controle da preparação física.
 */

export type FoldKey =
  | 'peitoral'
  | 'axilar'
  | 'triceps'
  | 'subescapular'
  | 'abdominal'
  | 'suprailiaca'
  | 'coxa'
  /** Dobras extras da planilha: são anotadas, mas não entram na soma do protocolo */
  | 'bicipital'
  | 'panturrilha';

export type Sexo = 'Masculino' | 'Feminino';

export interface FoldSite {
  key: FoldKey;
  sigla: string;
  nome: string;
  /** Entra na soma das 7 dobras de Jackson & Pollock */
  soma: boolean;
  /** Como o treinador mede (dica curta na tela) */
  dica: string;
}

/** Ordem de medida do protocolo; as duas últimas são extras (não somam). */
export const FOLD_SITES: FoldSite[] = [
  { key: 'peitoral', sigla: 'PT', nome: 'Peitoral', soma: true, dica: 'Diagonal entre o mamilo e a axila' },
  { key: 'axilar', sigla: 'AM', nome: 'Axilar média', soma: true, dica: 'Vertical na linha da axila, entre as costelas' },
  { key: 'triceps', sigla: 'TR', nome: 'Tríceps', soma: true, dica: 'Vertical na parte de trás do braço' },
  { key: 'subescapular', sigla: 'SE', nome: 'Subescapular', soma: true, dica: 'Diagonal abaixo da escápula' },
  { key: 'abdominal', sigla: 'AB', nome: 'Abdominal', soma: true, dica: 'Vertical ao lado do umbigo' },
  { key: 'suprailiaca', sigla: 'SI', nome: 'Suprailíaca', soma: true, dica: 'Diagonal acima do osso do quadril' },
  { key: 'coxa', sigla: 'CX', nome: 'Coxa', soma: true, dica: 'Vertical no meio da coxa, na frente' },
  { key: 'bicipital', sigla: 'BI', nome: 'Bicipital', soma: false, dica: 'Extra: frente do braço (não entra na soma)' },
  { key: 'panturrilha', sigla: 'PN', nome: 'Panturrilha', soma: false, dica: 'Extra: lateral da panturrilha (não entra na soma)' },
];

/** As 7 dobras que somam no protocolo (ordem da planilha). */
export const PROTOCOL_FOLDS: FoldKey[] = FOLD_SITES.filter((f) => f.soma).map((f) => f.key);

export type FoldValues = Partial<Record<FoldKey, number | null>>;

/**
 * Intensidade relativa (0 a 1) de cada dobra medida, para mapas de calor.
 * 0 = menor valor do conjunto, 1 = maior — mostra onde há mais/menos gordura
 * em relação às próprias dobras do atleta, sem comparar regiões diferentes.
 */
export function foldIntensityScale(folds: FoldValues): Partial<Record<FoldKey, number>> {
  const measured = FOLD_SITES.flatMap(({ key }) => {
    const v = folds[key];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? [[key, v] as const] : [];
  });
  if (measured.length === 0) return {};
  const values = measured.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const out: Partial<Record<FoldKey, number>> = {};
  measured.forEach(([key, v]) => {
    out[key] = span > 0 ? (v - min) / span : 0.5;
  });
  return out;
}

export const IDADE_MIN = 5;
export const IDADE_MAX = 100;
export const DOBRA_MIN = 1;
export const DOBRA_MAX = 90;
export const PESO_MIN = 20;
export const PESO_MAX = 250;

const round = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

/** Dobras do protocolo que ainda estão vazias (na ordem de medida). */
export function missingFolds(folds: FoldValues): FoldKey[] {
  return PROTOCOL_FOLDS.filter((k) => {
    const v = folds[k];
    return typeof v !== 'number' || !Number.isFinite(v) || v <= 0;
  });
}

/** Quantas das 7 dobras já foram preenchidas. */
export function filledFolds(folds: FoldValues): number {
  return PROTOCOL_FOLDS.length - missingFolds(folds).length;
}

/** Soma das 7 dobras em mm (null enquanto faltar alguma). */
export function sumFolds(folds: FoldValues): number | null {
  if (missingFolds(folds).length > 0) return null;
  return round(PROTOCOL_FOLDS.reduce((total, k) => total + Number(folds[k]), 0), 1);
}

/**
 * Densidade corporal (g/ml) — Jackson & Pollock (1978), 7 dobras.
 * Homens: DC = 1,112 − 0,00043499·S + 0,00000055·S² − 0,00028826·idade
 * Mulheres: DC = 1,097 − 0,00046971·S + 0,00000056·S² − 0,00012828·idade
 */
export function pollockDensity(somaDobras: number, idade: number, sexo: Sexo): number {
  const s = somaDobras;
  const s2 = s * s;
  return sexo === 'Feminino'
    ? 1.097 - 0.00046971 * s + 0.00000056 * s2 - 0.00012828 * idade
    : 1.112 - 0.00043499 * s + 0.00000055 * s2 - 0.00028826 * idade;
}

/** % de gordura pela equação de Siri: (495 / densidade) − 450. */
export function siriPercent(densidade: number): number {
  return 495 / densidade - 450;
}

export interface BodyCompositionResult {
  /** Soma das 7 dobras (mm) */
  soma: number;
  /** Densidade corporal (g/ml) */
  densidade: number;
  /** % de gordura (2 casas decimais, sem arredondar para inteiro) */
  percentual: number;
  /** Massa magra em kg (null sem o peso) */
  massaMagra: number | null;
  /** Massa de gordura em kg (null sem o peso) */
  massaGorda: number | null;
}

/**
 * Resultado completo. `null` quando falta alguma das 7 dobras, a idade está fora da
 * faixa ou o resultado sai impossível (densidade fora de 1,00–1,12).
 */
export function bodyComposition(input: {
  folds: FoldValues;
  idade: number | null | undefined;
  sexo: Sexo;
  peso?: number | null;
}): BodyCompositionResult | null {
  const soma = sumFolds(input.folds);
  const idade = Number(input.idade);
  if (soma === null || !Number.isFinite(idade) || idade < IDADE_MIN || idade > IDADE_MAX) return null;

  const densidade = pollockDensity(soma, idade, input.sexo);
  if (!(densidade > 0)) return null;
  const bruto = siriPercent(densidade);
  if (!(bruto > 0 && bruto < 70)) return null;

  // Duas casas: 16,73% aparece como 16,73 (não vira 17%)
  const percentual = round(bruto, 2);
  const peso = Number(input.peso);
  const temPeso = Number.isFinite(peso) && peso >= PESO_MIN && peso <= PESO_MAX;
  const massaGorda = temPeso ? round((peso * percentual) / 100, 1) : null;
  const massaMagra = temPeso && massaGorda !== null ? round(peso - massaGorda, 1) : null;

  return { soma, densidade: round(densidade, 4), percentual, massaMagra, massaGorda };
}

/** Texto curto de uma variação: −0,4 / +1,2 / 0. */
export function formatDelta(delta: number, casas = 1): string {
  const v = round(delta, casas);
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: casas })}`;
}
