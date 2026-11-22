import { describe, expect, it } from 'vitest';
import { estimateVo2, formatTest, normalizeTests, summarizeTests, validateTest, type PhysicalTestEntry } from './physicalTests';

const e = (id: string, teste: PhysicalTestEntry['teste'], data: string, valor: number, estagio: number | null = null): PhysicalTestEntry => ({
  id,
  teste,
  data,
  valor,
  estagio,
});

describe('physicalTests', () => {
  it('estima o VO2 do beep test (nível e vaivém)', () => {
    expect(estimateVo2(10, 0)).toBe(46.8);
    expect(estimateVo2(10, 5)).toBeGreaterThan(estimateVo2(10, 0));
    expect(estimateVo2(11, 1)).toBeGreaterThan(estimateVo2(10, 9));
  });

  it('formata cada teste com a unidade', () => {
    expect(formatTest(e('1', 'barra_reps', '2026-11-01', 12))).toBe('12 rep.');
    expect(formatTest(e('1', 'barra_iso', '2026-11-01', 45.5))).toBe('45,5 s');
    expect(formatTest(e('1', 'beep', '2026-11-01', 10, 5))).toBe('Nível 10.5');
    expect(formatTest(e('1', 'beep', '2026-11-01', 9))).toBe('Nível 9');
    expect(formatTest(e('1', 'cmj', '2026-11-01', 42.3))).toBe('42,3 cm');
  });

  it('confere os limites de cada teste', () => {
    expect(validateTest('barra_reps', 12, null)).toBeNull();
    expect(validateTest('barra_reps', 12.5, null)).not.toBeNull();
    expect(validateTest('barra_iso', 0, null)).not.toBeNull();
    expect(validateTest('beep', 10, 17)).not.toBeNull();
    expect(validateTest('beep', 10, null)).toBeNull();
    expect(validateTest('cmj', 40, 2)).not.toBeNull();
    expect(validateTest('cmj', 130, null)).not.toBeNull();
  });

  it('resume último, melhor e diferença para o anterior', () => {
    const s = summarizeTests([
      e('a', 'cmj', '2026-09-01', 40),
      e('b', 'cmj', '2026-10-01', 44),
      e('c', 'cmj', '2026-11-01', 42),
      e('d', 'beep', '2026-10-01', 10, 8),
      e('f', 'beep', '2026-11-01', 11, 1),
    ]);
    const cmj = s.get('cmj')!;
    expect(cmj.latest.id).toBe('c');
    expect(cmj.best.id).toBe('b');
    expect(cmj.diff).toBe(-2);
    expect(s.get('beep')!.best.id).toBe('f');
    expect(s.has('barra_reps')).toBe(false);
  });

  it('converte os números vindos do banco e ignora testes desconhecidos', () => {
    const rows = normalizeTests([
      { id: '1', teste: 'cmj', data: '2026-11-01', valor: '41.50', estagio: null },
      { id: '2', teste: 'outro', data: '2026-11-01', valor: '1', estagio: null },
    ] as unknown as PhysicalTestEntry[]);
    expect(rows).toHaveLength(1);
    expect(rows[0].valor).toBe(41.5);
  });
});
