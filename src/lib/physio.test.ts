import { describe, expect, it } from 'vitest';
import { criteriaProgress, formatPhysioRegion, physioReturnInfo } from './physio';

describe('physioReturnInfo', () => {
  const base = { status: 'tratamento' as const, previsao_retorno: '2026-11-10' };

  it('mostra a alta com a data real quando existe', () => {
    expect(physioReturnInfo({ status: 'alta', previsao_retorno: '2026-11-10', retorno_real: '2026-11-08' }, '2026-11-08')).toEqual({
      state: 'alta',
      label: 'Alta em 08/11',
      days: null,
    });
  });

  it('indica caso sem previsão', () => {
    expect(physioReturnInfo({ status: 'avaliacao', previsao_retorno: null }, '2026-11-03')).toEqual({
      state: 'sem_previsao',
      label: 'Sem previsão',
      days: null,
    });
  });

  it('marca atraso quando a previsão já passou', () => {
    expect(physioReturnInfo(base, '2026-11-13')).toMatchObject({ state: 'atrasado', label: 'Atrasado 3d', days: -3 });
  });

  it('marca atenção na semana da previsão', () => {
    expect(physioReturnInfo(base, '2026-11-10')).toMatchObject({ state: 'atencao', label: 'Previsão hoje', days: 0 });
    expect(physioReturnInfo(base, '2026-11-05')).toMatchObject({ state: 'atencao', label: 'Faltam 5d', days: 5 });
  });

  it('marca no prazo quando falta mais de uma semana', () => {
    expect(physioReturnInfo(base, '2026-11-01')).toMatchObject({ state: 'no_prazo', label: 'Faltam 9d', days: 9 });
  });
});

describe('criteriaProgress', () => {
  it('conta critérios cumpridos e a porcentagem', () => {
    expect(criteriaProgress([{ cumprido: true }, { cumprido: false }, { cumprido: true }])).toEqual({ done: 2, total: 3, pct: 67 });
  });

  it('não divide por zero sem critérios', () => {
    expect(criteriaProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe('formatPhysioRegion', () => {
  it('junta a região com o lado', () => {
    expect(formatPhysioRegion('Joelho', 'direito')).toBe('Joelho • direito');
    expect(formatPhysioRegion('Lombar', null)).toBe('Lombar');
  });
});
