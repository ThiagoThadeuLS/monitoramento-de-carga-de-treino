import { describe, expect, it } from 'vitest';
import { addDaysISO, dateInAppZone, scheduleWeekBounds, stampInAppZone, startOfWeekISO, timeInAppZone } from './date';

describe('horário de Brasília (o mesmo do banco)', () => {
  it('23h30 em Brasília ainda é o mesmo dia (em UTC já seria o seguinte)', () => {
    const d = new Date('2026-11-03T02:30:00Z'); // 02/11 23:30 em Brasília
    expect(dateInAppZone(d)).toBe('2026-11-02');
    expect(timeInAppZone(d)).toBe('23:30');
  });

  it('atleta no Japão às 8h do dia 3: ainda é dia 2 em Brasília', () => {
    const d = new Date('2026-11-02T23:00:00Z'); // 03/11 08:00 em Tóquio
    expect(dateInAppZone(d)).toBe('2026-11-02');
  });

  it('stampInAppZone: data e hora de um envio; vazio se faltar', () => {
    expect(stampInAppZone('2026-11-02T12:05:00Z')).toEqual(['2026-11-02', '09:05']);
    expect(stampInAppZone(undefined)).toEqual(['', '']);
    expect(stampInAppZone('não é data')).toEqual(['', '']);
  });
});

describe('contas com datas', () => {
  it('addDaysISO atravessa mês e ano', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('startOfWeekISO: segunda-feira (domingo pertence à semana anterior)', () => {
    expect(startOfWeekISO('2026-11-02')).toBe('2026-11-02'); // segunda
    expect(startOfWeekISO('2026-11-05')).toBe('2026-11-02'); // quinta
    expect(startOfWeekISO('2026-11-08')).toBe('2026-11-02'); // domingo
  });

  it('scheduleWeekBounds: semana passada, atual e próxima', () => {
    expect(scheduleWeekBounds('2026-11-05')).toEqual({
      minWeek: '2026-10-26',
      maxWeek: '2026-11-09',
      minDate: '2026-10-26',
      maxDate: '2026-11-15',
    });
  });
});
