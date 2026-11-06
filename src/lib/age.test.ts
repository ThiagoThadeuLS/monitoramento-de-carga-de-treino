import { describe, expect, it } from 'vitest';
import { ageOn, isBirthday } from './age';

describe('ageOn', () => {
  it('conta anos completos', () => {
    expect(ageOn('2005-04-29', '2026-04-29')).toBe(21);
    expect(ageOn('2005-04-29', '2026-04-28')).toBe(20);
    expect(ageOn('2005-04-29', '2026-11-05')).toBe(21);
  });

  it('ignora data inválida ou futura', () => {
    expect(ageOn(null, '2026-11-05')).toBeNull();
    expect(ageOn('29/04/2005', '2026-11-05')).toBeNull();
    expect(ageOn('2030-01-01', '2026-11-05')).toBeNull();
  });
});

describe('isBirthday', () => {
  it('compara dia e mês, não o ano', () => {
    expect(isBirthday('2005-11-05', '2026-11-05')).toBe(true);
    expect(isBirthday('2005-11-06', '2026-11-05')).toBe(false);
    expect(isBirthday(null, '2026-11-05')).toBe(false);
  });
});
