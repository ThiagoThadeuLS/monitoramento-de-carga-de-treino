import { describe, expect, it } from 'vitest';
import {
  bodyComposition,
  filledFolds,
  foldIntensityScale,
  foldsOutOfRange,
  formatDelta,
  missingFolds,
  pollockDensity,
  sumFolds,
} from './bodyFat';

const dobras = (v: number[]) => ({
  peitoral: v[0],
  axilar: v[1],
  triceps: v[2],
  subescapular: v[3],
  abdominal: v[4],
  suprailiaca: v[5],
  coxa: v[6],
});

// Linhas da planilha de controle (Jackson & Pollock, homens)
describe('Jackson & Pollock 7 dobras', () => {
  it('17 anos, 78,5 kg, soma 107 → 14,0% e 67,5 kg de massa magra', () => {
    const r = bodyComposition({
      folds: dobras([8, 8, 12, 15, 21, 19, 24]),
      idade: 17,
      sexo: 'Masculino',
      peso: 78.5,
    })!;
    expect(r.soma).toBe(107);
    expect(r.densidade).toBeCloseTo(1.067, 3);
    // A planilha mostra 14,0%; aqui o número fica com duas casas (não arredonda para inteiro)
    expect(r.percentual).toBeCloseTo(14, 1);
    expect(r.percentual).not.toBe(14);
    expect(r.massaMagra).toBe(67.5);
    expect(r.massaGorda).toBe(11);
  });

  it('21 anos, 86,5 kg, soma 103 → 13,9% e 74,5 kg de massa magra', () => {
    const r = bodyComposition({
      folds: dobras([9, 10, 10, 17, 17, 18, 22]),
      idade: 21,
      sexo: 'Masculino',
      peso: 86.5,
    })!;
    expect(r.soma).toBe(103);
    expect(r.percentual).toBeCloseTo(13.9, 1);
    expect(r.percentual).not.toBe(13.9);
    expect(r.massaMagra).toBe(74.5);
    expect(r.massaGorda).toBe(12);
  });

  it('19 anos, 79,5 kg, soma 82 → 10,7%', () => {
    const r = bodyComposition({
      folds: dobras([6, 7, 9, 14, 15, 13, 18]),
      idade: 19,
      sexo: 'Masculino',
      peso: 79.5,
    })!;
    expect(r.soma).toBe(82);
    expect(r.percentual).toBeCloseTo(10.7, 1);
    expect(r.percentual).not.toBe(10.7);
  });

  it('usa a equação feminina quando o sexo é feminino', () => {
    const folds = dobras([10, 10, 15, 15, 20, 15, 25]);
    const dc = pollockDensity(110, 25, 'Feminino');
    expect(dc).toBeCloseTo(1.097 - 0.00046971 * 110 + 0.00000056 * 110 ** 2 - 0.00012828 * 25, 6);
    const r = bodyComposition({ folds, idade: 25, sexo: 'Feminino' })!;
    expect(r.percentual).toBeGreaterThan(15);
    expect(r.percentual).toBeLessThan(30);
    expect(r.massaMagra).toBeNull();
  });
});

describe('dobras incompletas', () => {
  it('não calcula enquanto faltar uma das 7 dobras', () => {
    const folds = { ...dobras([8, 8, 12, 15, 21, 19, 24]), coxa: null };
    expect(missingFolds(folds)).toEqual(['coxa']);
    expect(sumFolds(folds)).toBeNull();
    expect(bodyComposition({ folds, idade: 17, sexo: 'Masculino' })).toBeNull();
  });

  it('conta só as 7 dobras do protocolo (extras não somam)', () => {
    const folds = { ...dobras([8, 8, 12, 15, 21, 19, 24]), bicipital: 4, panturrilha: 11 };
    expect(filledFolds(folds)).toBe(7);
    expect(sumFolds(folds)).toBe(107);
  });

  it('ignora idade fora da faixa', () => {
    const folds = dobras([8, 8, 12, 15, 21, 19, 24]);
    expect(bodyComposition({ folds, idade: 0, sexo: 'Masculino' })).toBeNull();
    expect(bodyComposition({ folds, idade: null, sexo: 'Masculino' })).toBeNull();
  });
});

describe('dobras fora da faixa', () => {
  it('recusa medidas acima de 90 mm (100 em todas as dobras)', () => {
    const folds = dobras([100, 100, 100, 100, 100, 100, 100]);
    expect(foldsOutOfRange(folds)).toEqual([
      'peitoral',
      'axilar',
      'triceps',
      'subescapular',
      'abdominal',
      'suprailiaca',
      'coxa',
    ]);
    expect(bodyComposition({ folds, idade: 25, sexo: 'Masculino', peso: 80 })).toBeNull();
  });

  it('recusa as extras fora da faixa mesmo com as 7 do protocolo válidas', () => {
    const folds = { ...dobras([8, 8, 12, 15, 21, 19, 24]), bicipital: 0.5, panturrilha: 100 };
    expect(foldsOutOfRange(folds)).toEqual(['bicipital', 'panturrilha']);
  });

  it('aceita os limites de 1 e 90 mm', () => {
    const folds = dobras([1, 90, 1, 90, 1, 90, 1]);
    expect(foldsOutOfRange(folds)).toEqual([]);
  });
});

describe('formatDelta', () => {
  it('mostra sinal com vírgula decimal', () => {
    expect(formatDelta(-0.44)).toBe('−0,4');
    expect(formatDelta(1.25)).toBe('+1,3');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('foldIntensityScale', () => {
  it('normaliza as dobras medidas entre 0 e 1', () => {
    const heat = foldIntensityScale(dobras([8, 8, 12, 15, 21, 19, 24]));
    expect(heat.peitoral).toBe(0);
    expect(heat.axilar).toBe(0);
    expect(heat.coxa).toBe(1);
    expect(heat.abdominal).toBeCloseTo((21 - 8) / (24 - 8), 6);
  });

  it('inclui as dobras extras e ignora vazias', () => {
    const heat = foldIntensityScale({ ...dobras([8, 8, 12, 15, 21, 19, 24]), bicipital: 4, panturrilha: null });
    expect(heat.bicipital).toBe(0);
    expect(heat.panturrilha).toBeUndefined();
  });

  it('fica neutro quando todas as dobras são iguais', () => {
    const heat = foldIntensityScale(dobras([10, 10, 10, 10, 10, 10, 10]));
    expect(Object.values(heat)).toEqual(Array(7).fill(0.5));
  });
});
