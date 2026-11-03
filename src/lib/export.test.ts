import { describe, expect, it } from 'vitest';
import { brDate, cell, fileSlug, toCsv } from './export';

describe('cell (CSV)', () => {
  it('números com vírgula decimal e booleanos em português', () => {
    expect(cell(7)).toBe('7');
    expect(cell(59.256)).toBe('59,26');
    expect(cell(true)).toBe('sim');
    expect(cell(false)).toBe('não');
    expect(cell(null)).toBe('');
  });

  it('aspas para texto com ; aspas ou quebra de linha', () => {
    expect(cell('a;b')).toBe('"a;b"');
    expect(cell('disse "oi"')).toBe('"disse ""oi"""');
  });

  it('texto que o Excel leria como fórmula vira texto', () => {
    expect(cell('=HYPERLINK("http://x","clique")')).toBe(`"'=HYPERLINK(""http://x"",""clique"")"`);
    expect(cell('+5511999')).toBe("'+5511999");
    expect(cell('-2+3')).toBe("'-2+3");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('números negativos continuam números', () => {
    expect(cell(-3)).toBe('-3');
  });
});

describe('toCsv', () => {
  it('cabeçalho + linhas com ; e CRLF', () => {
    const csv = toCsv([{ n: 'Ana', v: 1.5 }], [
      { label: 'Nome', value: (r) => r.n },
      { label: 'Valor', value: (r) => r.v },
    ]);
    expect(csv).toBe('Nome;Valor\r\nAna;1,50');
  });
});

describe('formatos', () => {
  it('brDate e fileSlug', () => {
    expect(brDate('2026-10-05')).toBe('05/10/2026');
    expect(fileSlug('Peso', '2026-10-01', 'até', 'São Paulo')).toBe('peso_2026-10-01_ate_sao-paulo');
  });
});
