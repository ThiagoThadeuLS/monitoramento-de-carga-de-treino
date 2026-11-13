import { describe, expect, it } from 'vitest';
import { attentionLevel, attentionReasons, pendingForDay } from './attention';
import { LoadMetrics } from './load';
import { PseRecord, PsrRecord, TrainingSession } from '../types';

const session = (id: string, start: string, end: string, type = 'Treino Randori'): TrainingSession => ({
  id, date: '2026-11-10', start_time: `${start}:00`, end_time: `${end}:00`, name: id, training_type: type, expected_pse: 7,
});
const pse = (p: Partial<PseRecord>): PseRecord => ({ athlete_id: 'a', date: '2026-11-10', rpe_score: 6, did_not_train: false, ...p });
const psr = (p: Partial<PsrRecord>): PsrRecord => ({
  athlete_id: 'a', date: '2026-11-10', psr_score: 7, fatigue_score: 7, sleep_score: 7, muscle_soreness_score: 7, stress_score: 7, mood_score: 7, ...p,
});
const load = (p: Partial<LoadMetrics>): LoadMetrics => ({
  acute: 0, chronic: 0, acwr: null, zone: null, monotony: null, strain: null, sessions: 0, insufficient: false, ...p,
});

describe('pendingForDay', () => {
  const sessions = [session('Físico', '07:30', '09:00', 'Treino Físico'), session('Randori', '17:00', '18:45')];

  it('hoje: só cobra o treino que já acabou (20 min depois do fim)', () => {
    const r = pendingForDay({ date: '2026-11-10', today: '2026-11-10', now: '10:00', sessions, pse: [] });
    expect(r.sessions.map((s) => s.id)).toEqual(['Físico']);
    expect(r.psr).toBe(true);
  });

  it('antes do primeiro treino ainda não cobra a PSR', () => {
    const r = pendingForDay({ date: '2026-11-10', today: '2026-11-10', now: '06:30', sessions, pse: [] });
    expect(r).toEqual({ psr: false, sessions: [] });
  });

  it('dia passado: cobra tudo que faltou e reconhece a PSE pelo tipo de treino', () => {
    const r = pendingForDay({
      date: '2026-11-09', today: '2026-11-10', now: '10:00', sessions,
      pse: [pse({ training_type: 'Treino Randori' })], psr: psr({}),
    });
    expect(r.sessions.map((s) => s.id)).toEqual(['Físico']);
    expect(r.psr).toBe(false);
  });

  it('"não treinei" sem tipo vale para o dia todo', () => {
    const r = pendingForDay({ date: '2026-11-09', today: '2026-11-10', now: '10:00', sessions, pse: [pse({ did_not_train: true, rpe_score: null })] });
    expect(r.sessions).toEqual([]);
  });
});

describe('attentionReasons', () => {
  it('ordena do mais grave para o mais leve', () => {
    const r = attentionReasons({
      load: load({ zone: 'risco', acwr: 1.72, monotony: 2.3 }),
      pse: [pse({ rpe_score: 10 })],
      psr: psr({ muscle_soreness_score: 2 }),
      push: 'expirou',
    });
    expect(r.map((x) => x.kind)).toEqual(['acwr', 'dor', 'monotonia', 'esforco', 'notificacao']);
    expect(attentionLevel(r)).toBe(3);
  });

  it('ACWR com poucos dados não entra', () => {
    expect(attentionReasons({ load: load({ zone: 'risco', acwr: 2, insufficient: true }), pse: [] })).toEqual([]);
  });

  it('sem resposta diz o que falta', () => {
    const r = attentionReasons({ pse: [], pending: { psr: true, sessions: [session('Randori', '17:00', '18:45')] } });
    expect(r[0]).toMatchObject({ kind: 'sem_resposta', detail: 'PSR, PSE Randori' });
  });

  it('atleta sem nada fora do normal: lista vazia', () => {
    expect(attentionLevel(attentionReasons({ load: load({ zone: 'ideal', acwr: 1.1 }), pse: [pse({})], psr: psr({}) }))).toBe(0);
  });
});
