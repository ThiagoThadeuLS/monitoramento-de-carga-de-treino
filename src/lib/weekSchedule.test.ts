import { describe, expect, it } from 'vitest';
import { weekScheduleText } from './weekSchedule';

describe('weekScheduleText', () => {
  it('monta a semana de segunda a domingo, em ordem de horário', () => {
    const text = weekScheduleText('2026-11-23', [
      { date: '2026-11-23', start_time: '14:00:00', end_time: '15:30:00', name: 'treino de newaza' },
      { date: '2026-11-23', start_time: '08:00:00', end_time: '10:00:00', name: 'TESTE DE FORÇA MÁXIMA - 1 RM' },
      { date: '2026-11-24', start_time: '14:00', end_time: null, name: 'treino tati waza' },
    ]);
    const lines = text.split('\n');
    expect(lines.slice(0, 6)).toEqual([
      'Segunda-Feira 23/11',
      '08:00–10:00 TESTE DE FORÇA MÁXIMA - 1 RM',
      '14:00–15:30 treino de newaza',
      'Terça-Feira 24/11',
      '14:00 treino tati waza',
      'Quarta-Feira 25/11',
    ]);
    expect(lines.slice(-2)).toEqual(['Domingo 29/11', 'Sem treinos.']);
  });
});
