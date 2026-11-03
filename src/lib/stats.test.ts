import { describe, expect, it } from 'vitest';
import { formatNumber, mean, median, modes } from './stats';

describe('mean', () => {
  it('calcula a média', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('median', () => {
  it('quantidade ímpar: valor do meio (sem alterar a lista)', () => {
    const values = [9, 1, 5];
    expect(median(values)).toBe(5);
    expect(values).toEqual([9, 1, 5]);
  });

  it('quantidade par: média dos dois do meio', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe('modes', () => {
  it('valor mais frequente', () => {
    expect(modes([3, 7, 7, 2])).toEqual([7]);
  });

  it('empate: todos os mais frequentes, em ordem crescente', () => {
    expect(modes([8, 2, 8, 2, 5])).toEqual([2, 8]);
  });
});

describe('formatNumber', () => {
  it('inteiro sem casas e decimal com vírgula', () => {
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(6.25)).toBe('6,3');
  });
});
