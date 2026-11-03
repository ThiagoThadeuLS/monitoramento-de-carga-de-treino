import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, onlyCpfDigits } from './cpf';

describe('onlyCpfDigits', () => {
  it('tira pontuação e limita a 11 dígitos', () => {
    expect(onlyCpfDigits('529.982.247-25')).toBe('52998224725');
    expect(onlyCpfDigits('5299822472599')).toBe('52998224725');
  });
});

describe('formatCpf', () => {
  it('aplica a máscara enquanto digita', () => {
    expect(formatCpf('529')).toBe('529');
    expect(formatCpf('5299')).toBe('529.9');
    expect(formatCpf('5299822')).toBe('529.982.2');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('isValidCpf', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e números repetidos', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('1234567890')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
});
