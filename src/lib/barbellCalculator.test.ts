import { describe, expect, it } from 'vitest';
import { ajustarCargaMontavel, calcularAnilhasPorLado, calcularMontagemBarra, encontrarMontagemLado } from './barbellCalculator';

const sideTotal = (plates: { plate: number; qty: number }[]) => plates.reduce((s, p) => s + p.plate * p.qty, 0);

describe('encontrarMontagemLado', () => {
  it('usa o menor número de anilhas', () => {
    expect(encontrarMontagemLado(45)).toEqual([
      { plate: 25, qty: 1 },
      { plate: 20, qty: 1 },
    ]);
  });

  it('meio quilo por lado precisa da anilha de 2,5', () => {
    const plates = encontrarMontagemLado(7.5)!;
    expect(sideTotal(plates)).toBe(7.5);
    expect(plates).toContainEqual({ plate: 2.5, qty: 1 });
  });

  it('impossível com as anilhas disponíveis (0,5 kg)', () => {
    expect(encontrarMontagemLado(0.5)).toBeNull();
  });

  it('zero por lado: só a barra', () => {
    expect(encontrarMontagemLado(0)).toEqual([]);
  });
});

describe('ajustarCargaMontavel', () => {
  it('peso exato montável fica igual', () => {
    const r = ajustarCargaMontavel(100);
    expect(r.pesoAjustado).toBe(100);
    expect(r.pesoLado).toBe(40);
    expect(sideTotal(r.plates)).toBe(40);
  });

  it('nunca arredonda para cima (segurança da carga prescrita)', () => {
    for (const alvo of [21, 33.3, 57.9, 70.5, 88.8, 101, 142.7, 199.99]) {
      const r = ajustarCargaMontavel(alvo);
      expect(r.pesoAjustado).toBeLessThanOrEqual(alvo);
      expect(alvo - r.pesoAjustado).toBeLessThan(2);
      expect(20 + 2 * sideTotal(r.plates)).toBe(r.pesoAjustado);
    }
  });

  it('70% de 100 kg (erro de ponto flutuante) continua 70 kg', () => {
    expect(ajustarCargaMontavel((100 * 70) / 100).pesoAjustado).toBe(70);
    expect(ajustarCargaMontavel(0.7 * 100).pesoAjustado).toBe(70);
  });

  it('alvo abaixo da barra ou inválido: só a barra', () => {
    expect(ajustarCargaMontavel(15)).toEqual({ pesoAjustado: 20, pesoLado: 0, plates: [] });
    expect(ajustarCargaMontavel(Number.NaN).pesoAjustado).toBe(20);
  });

  it('respeita outra barra (15 kg)', () => {
    const r = ajustarCargaMontavel(40, 15);
    expect(r.pesoAjustado).toBe(40);
    expect(15 + 2 * sideTotal(r.plates)).toBe(40);
  });
});

describe('calcularMontagemBarra / calcularAnilhasPorLado', () => {
  it('informa o peso teórico quando ajusta', () => {
    const s = calcularMontagemBarra(71.4);
    expect(s.totalWeight).toBe(71);
    expect(s.theoreticalWeight).toBe(71.4);
  });

  it('texto usa o peso da barra informada', () => {
    expect(calcularAnilhasPorLado(10)).toBe('Apenas a barra (20 kg)');
    expect(calcularAnilhasPorLado(12, 15)).toBe('Apenas a barra (15 kg)');
    expect(calcularAnilhasPorLado(100)).toBe('25 kg + 15 kg de cada lado (100 kg total)');
  });
});
