import { describe, expect, it } from 'vitest';
import { acwrZone, dailyLoads, groupSeries, loadMetrics, sessionLoad } from './load';
import { addDaysISO } from './date';
import { PseRecord } from '../types';

const pse = (athlete_id: string, date: string, rpe: number | null, minutes: number | null, did_not_train = false): PseRecord => ({
  athlete_id,
  date,
  rpe_score: rpe,
  duration_minutes: minutes,
  did_not_train,
});

/** Mapa data -> carga com o mesmo valor em todos os dias de um intervalo */
const constantDaily = (end: string, days: number, value: number) =>
  new Map(Array.from({ length: days }, (_, k) => [addDaysISO(end, -k), value] as [string, number]));

describe('sessionLoad', () => {
  it('carga = PSE x minutos (método de Foster)', () => {
    expect(sessionLoad(pse('a', '2026-10-01', 7, 60))).toBe(420);
  });

  it('sem carga quando não treinou ou falta PSE/duração', () => {
    expect(sessionLoad(pse('a', '2026-10-01', 7, 60, true))).toBeNull();
    expect(sessionLoad(pse('a', '2026-10-01', null, 60))).toBeNull();
    expect(sessionLoad(pse('a', '2026-10-01', 7, null))).toBeNull();
  });
});

describe('dailyLoads', () => {
  it('soma as sessões do mesmo dia, por atleta', () => {
    const map = dailyLoads([
      pse('a', '2026-10-01', 5, 60),
      pse('a', '2026-10-01', 8, 30),
      pse('b', '2026-10-01', 4, 50),
      pse('a', '2026-10-02', 6, 10, true),
    ]);
    expect(map.get('a')?.get('2026-10-01')).toBe(540);
    expect(map.get('b')?.get('2026-10-01')).toBe(200);
    expect(map.get('a')?.has('2026-10-02')).toBe(false);
  });
});

describe('acwrZone', () => {
  it('faixas: abaixo de 0,8 / ideal até 1,3 / atenção até 1,5 / risco', () => {
    expect(acwrZone(0.79)).toBe('baixa');
    expect(acwrZone(0.8)).toBe('ideal');
    expect(acwrZone(1.3)).toBe('ideal');
    expect(acwrZone(1.31)).toBe('atencao');
    expect(acwrZone(1.5)).toBe('atencao');
    expect(acwrZone(1.51)).toBe('risco');
  });
});

describe('loadMetrics', () => {
  const ref = '2026-10-31';

  it('carga constante: ACWR 1 e sem monotonia (desvio-padrão zero)', () => {
    const m = loadMetrics(constantDaily(ref, 28, 100), ref, 7);
    expect(m.acute).toBe(700);
    expect(m.chronic).toBe(700);
    expect(m.acwr).toBe(1);
    expect(m.zone).toBe('ideal');
    expect(m.monotony).toBeNull();
    expect(m.strain).toBeNull();
    expect(m.sessions).toBe(7);
    expect(m.insufficient).toBe(false);
  });

  it('pico na última semana entra na zona de risco', () => {
    const daily = constantDaily(ref, 28, 100);
    for (let k = 0; k < 7; k++) daily.set(addDaysISO(ref, -k), 300);
    const m = loadMetrics(daily, ref);
    // aguda 2100; crônica (21x100 + 7x300) / 4 = 1050
    expect(m.acute).toBe(2100);
    expect(m.chronic).toBe(1050);
    expect(m.acwr).toBe(2);
    expect(m.zone).toBe('risco');
  });

  it('monotonia = média / desvio-padrão dos 7 dias (dias sem treino contam como 0)', () => {
    const daily = new Map([
      [ref, 600],
      [addDaysISO(ref, -2), 600],
    ]);
    const m = loadMetrics(daily, ref);
    const mean = 1200 / 7;
    const sd = Math.sqrt((2 * (600 - mean) ** 2 + 5 * mean ** 2) / 7);
    expect(m.monotony).toBeCloseTo(mean / sd, 10);
    expect(m.strain).toBeCloseTo(1200 * (mean / sd), 6);
  });

  it('menos de 3 semanas de histórico: ACWR marcado como pouco confiável', () => {
    expect(loadMetrics(constantDaily(ref, 10, 100), ref).insufficient).toBe(true);
    expect(loadMetrics(undefined, ref).insufficient).toBe(true);
    expect(loadMetrics(undefined, ref).acwr).toBeNull();
  });
});

describe('groupSeries', () => {
  it('carga média por atleta (inclui quem não treinou como zero)', () => {
    const per = new Map([['a', new Map([['2026-10-31', 400]])]]);
    const [point] = groupSeries(per, ['a', 'b'], ['2026-10-31']);
    expect(point.load).toBe(200);
    expect(point.acute).toBe(200);
  });
});
