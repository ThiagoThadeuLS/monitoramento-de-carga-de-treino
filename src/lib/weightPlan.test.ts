import { describe, expect, it } from 'vitest';
import { buildWeightPlan, daysBetweenISO, parseCategoryWeight, phaseFor } from './weightPlan';

const today = '2026-11-03';
// Categoria -66: limites de 8% = 71,2 kg; 5% = 69,3 kg; 3% = 67,9 kg (arredondados para baixo)
const plan = (weighInDate: string, currentWeight: number | null, extra: Partial<Parameters<typeof buildWeightPlan>[0]> = {}) =>
  buildWeightPlan({ today, weighInDate, currentWeight, targetWeight: 66, category: '-66', ...extra });

describe('parseCategoryWeight', () => {
  it('lê o limite da categoria e ignora as categorias "+"', () => {
    expect(parseCategoryWeight('-66')).toBe(66);
    expect(parseCategoryWeight('-66Kg')).toBe(66);
    expect(parseCategoryWeight(' -52,5 ')).toBe(52.5);
    expect(parseCategoryWeight('+100')).toBeNull();
    expect(parseCategoryWeight('')).toBeNull();
    expect(parseCategoryWeight(null)).toBeNull();
  });
});

describe('daysBetweenISO e fases', () => {
  it('conta os dias entre datas (atravessa mês e ano)', () => {
    expect(daysBetweenISO('2026-11-03', '2026-12-01')).toBe(28);
    expect(daysBetweenISO('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenISO('2026-11-03', '2026-11-01')).toBe(-2);
  });

  it('14+ dias: 8%; 7 a 13: 5%; 1 a 6: 3%; dia da pesagem: 0%', () => {
    expect(phaseFor(30).maxPercent).toBe(8);
    expect(phaseFor(14).maxPercent).toBe(8);
    expect(phaseFor(13).maxPercent).toBe(5);
    expect(phaseFor(7).maxPercent).toBe(5);
    expect(phaseFor(6).maxPercent).toBe(3);
    expect(phaseFor(1).maxPercent).toBe(3);
    expect(phaseFor(0).maxPercent).toBe(0);
  });
});

describe('longe da competição: até 8% acima', () => {
  it('6% acima com a próxima fase longe: dentro do limite', () => {
    const p = plan('2026-12-01', 70); // 28 dias
    expect(p.status).toBe('seguro');
    expect(p.limit).toEqual({ percent: 8, weight: 71.2 });
    expect(p.nextLimit).toMatchObject({ percent: 5, weight: 69.3, from: '2026-11-18' });
    expect(p.needsToLose).toBe(true);
  });

  it('acima de 8%: acima do limite', () => {
    expect(plan('2026-12-01', 72).status).toBe('risco');
  });

  it('dentro de 8%, mas acima de 5% quando a semana anterior começa em até 7 dias: atenção', () => {
    const p = plan('2026-11-23', 70); // 20 dias; semana anterior começa em 10/11
    expect(p.status).toBe('atencao');
    expect(p.message).toMatch(/10\/11/);
  });
});

describe('semana anterior: até 5% acima', () => {
  it('5,3% acima: acima do limite', () => {
    expect(plan('2026-11-13', 69.5).status).toBe('risco'); // 10 dias
  });

  it('acima de 3% perto da semana da competição: atenção', () => {
    expect(plan('2026-11-13', 69).status).toBe('atencao');
  });

  it('até 3%: dentro do limite', () => {
    expect(plan('2026-11-13', 67.5).status).toBe('seguro');
  });
});

describe('semana da competição: até 3% acima', () => {
  it('2,9% acima: dentro do limite', () => {
    const p = plan('2026-11-07', 67.9); // 4 dias
    expect(p.status).toBe('seguro');
    expect(p.limit).toEqual({ percent: 3, weight: 67.9 });
    expect(p.nextLimit).toBeNull();
  });

  it('3,8% acima: acima do limite', () => {
    expect(plan('2026-11-07', 68.5).status).toBe('risco');
  });
});

describe('dia da pesagem e depois', () => {
  it('acima da categoria no dia da pesagem: acima do limite', () => {
    const p = plan(today, 66.3);
    expect(p.status).toBe('risco');
    expect(p.title).toMatch(/dia da pesagem/);
  });

  it('diferença de até 50 g conta como no peso', () => {
    const p = plan(today, 66.04);
    expect(p.status).toBe('no_alvo');
    expect(p.needsToLose).toBe(false);
  });

  it('depois da pesagem oficial: não fala mais em limite', () => {
    const p = plan('2026-11-02', 67);
    expect(p.status).toBe('pesagem_passou');
    expect(p.showLimit).toBe(false);
    expect(p.needsToLose).toBe(false);
  });
});

describe('outros casos', () => {
  it('abaixo da categoria: no peso', () => {
    expect(plan('2026-12-01', 64).status).toBe('no_alvo');
  });

  it('categoria "+" não tem limite', () => {
    const p = buildWeightPlan({ today, weighInDate: '2026-12-01', currentWeight: 110, targetWeight: null, category: '+100' });
    expect(p.status).toBe('sem_limite');
    expect(p.showLimit).toBe(false);
  });

  it('sem categoria e sem pesagem', () => {
    expect(buildWeightPlan({ today, weighInDate: '2026-12-01', currentWeight: 70, targetWeight: null, category: '' }).status).toBe('sem_categoria');
    expect(plan('2026-12-01', null).status).toBe('sem_dados');
  });

  it('última pesagem com mais de 14 dias: avisa para pesar de novo', () => {
    const p = plan('2026-12-01', 67, { currentDate: '2026-10-10' });
    expect(p.stale).toBe(true);
    expect(p.message).toMatch(/mais de 14 dias/);
  });

  it('tendência pelos registros dos últimos 21 dias', () => {
    const p = plan('2026-12-01', 67, {
      history: [
        { date: '2026-10-20', weight: 68 },
        { date: '2026-10-27', weight: 67.5 },
        { date: '2026-11-03', weight: 67 },
      ],
    });
    expect(p.trendWeeklyRate).toBeCloseTo(-0.5);
    expect(p.projectedWeight).toBe(65);
  });
});
