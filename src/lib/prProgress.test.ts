import { describe, expect, it } from 'vitest';
import { buildPrProgress } from './prProgress';

describe('buildPrProgress', () => {
  it('calcula ganho, % e quantas vezes a carga subiu', () => {
    const p = buildPrProgress(
      [
        { peso_pr: 80, created_at: '2026-08-01T12:00:00Z' },
        { peso_pr: 85, created_at: '2026-09-01T12:00:00Z' },
        { peso_pr: 82.5, created_at: '2026-09-20T12:00:00Z' },
        { peso_pr: 90, created_at: '2026-10-10T12:00:00Z' },
      ],
      90
    );
    expect(p.points).toHaveLength(4);
    expect(p.gainKg).toBe(10);
    expect(p.gainPct).toBe(12.5);
    expect(p.improvements).toBe(2);
    expect(p.lastImprovement).toBe('2026-10-10');
    expect(p.best).toBe(90);
    expect(p.steps[0]).toEqual({ date: '2026-10-10', peso: 90, diff: 7.5 });
    expect(p.steps[3].diff).toBeNull();
  });

  it('junta registros do mesmo dia (vale o último) no horário de Brasília', () => {
    const p = buildPrProgress(
      [
        { peso_pr: 100, created_at: '2026-10-01T15:00:00Z' },
        { peso_pr: 110, created_at: '2026-10-01T20:00:00Z' },
        // 01h UTC do dia 2 = 22h do dia 1 em Brasília
        { peso_pr: 105, created_at: '2026-10-02T01:00:00Z' },
      ],
      105
    );
    expect(p.points).toEqual([{ date: '2026-10-01', peso: 105 }]);
    expect(p.improvements).toBe(0);
    expect(p.gainKg).toBe(0);
  });

  it('sem histórico usa o PR atual', () => {
    const p = buildPrProgress([], 60, '2026-11-01T12:00:00Z');
    expect(p.points).toEqual([{ date: '2026-11-01', peso: 60 }]);
    expect(p.gainPct).toBe(0);
  });
});
