import { describe, expect, it } from 'vitest';
import type { AthleteAchievementsData } from './athleteAuth';
import {
  buildAchievements,
  buildBadges,
  computeStreak,
  monthToShare,
  newestBadge,
  summarize,
  visibleBadges,
  weekToShare,
  weeksInARow,
  weighInsInLimit,
} from './achievements';
import { addDaysISO } from './date';

// 2026-11-04 é quarta-feira; 2026-11-01 e 2026-11-08 são domingos
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDaysISO(from, i));

const base = (over: Partial<AthleteAchievementsData> = {}): AthleteAchievementsData => ({
  today: '2026-11-04',
  categoria: '-73',
  dias_respondidos: [],
  dias_treino: [],
  treinos: 0,
  marcos_treinos: {},
  pse: [],
  pesos: [],
  pesagens: [],
  prs: [],
  ...over,
});

describe('computeStreak', () => {
  it('conta os dias de treino respondidos; hoje sem resposta ainda não quebra', () => {
    const s = computeStreak(['2026-11-02', '2026-11-03'], ['2026-11-02', '2026-11-03', '2026-11-04'], '2026-11-04');
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it('dia sem treino (folga) não quebra a sequência', () => {
    const s = computeStreak(['2026-11-02', '2026-11-04'], ['2026-11-02', '2026-11-04'], '2026-11-04');
    expect(s.current).toBe(2);
  });

  it('treino sem resposta quebra a sequência', () => {
    const s = computeStreak(['2026-11-01', '2026-11-02', '2026-11-04'], ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], '2026-11-04');
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it('responder num dia sem treino também conta', () => {
    const s = computeStreak(['2026-11-01', '2026-11-02'], ['2026-11-02'], '2026-11-02');
    expect(s.current).toBe(2);
  });

  it('guarda a data em que chegou a 7 dias', () => {
    const d = days('2026-10-01', 8);
    const s = computeStreak(d, d, '2026-10-08');
    expect(s.current).toBe(8);
    expect(s.reached[7]).toBe('2026-10-07');
    expect(s.reached[30]).toBeUndefined();
  });
});

describe('weeksInARow', () => {
  it('4 semanas seguidas com resposta = primeiro mês completo', () => {
    // Semanas que começam em 05/10, 12/10, 19/10 e 26/10
    const r = weeksInARow(['2026-10-06', '2026-10-14', '2026-10-20', '2026-10-28'], '2026-11-04');
    expect(r.reachedAt).toBe('2026-10-28');
    // Semana atual (02/11) ainda sem resposta: não quebra
    expect(r.current).toBe(4);
  });

  it('uma semana sem resposta zera a contagem', () => {
    const r = weeksInARow(['2026-10-06', '2026-10-20', '2026-10-28'], '2026-11-04');
    expect(r.reachedAt).toBeNull();
    expect(r.current).toBe(2);
  });
});

describe('weighInsInLimit', () => {
  it('longe da competição vale até 8% acima da categoria (-73 kg: até 78,8 kg)', () => {
    const r = weighInsInLimit(
      [
        { date: '2026-10-01', weight: 78 },
        { date: '2026-10-08', weight: 78.8 },
        { date: '2026-10-15', weight: 77 },
        { date: '2026-10-22', weight: 76 },
      ],
      [],
      '-73'
    );
    expect(r.applicable).toBe(true);
    expect(r.current).toBe(4);
    expect(r.reached[4]).toBe('2026-10-22');
  });

  it('perto da pesagem o limite aperta (3% na semana da competição) e passar zera', () => {
    const r = weighInsInLimit(
      [
        { date: '2026-11-10', weight: 76 }, // 5 dias antes: limite 75,1 kg -> passou
        { date: '2026-11-15', weight: 73 }, // dia da pesagem: na categoria
      ],
      ['2026-11-15'],
      '-73'
    );
    expect(r.current).toBe(1);
  });

  it('categoria "+" ou sem categoria: o selo não vale', () => {
    expect(weighInsInLimit([{ date: '2026-10-01', weight: 120 }], [], '+100').applicable).toBe(false);
    expect(weighInsInLimit([], [], null).applicable).toBe(false);
  });
});

describe('períodos dos resumos', () => {
  it('semana: no domingo é a semana que termina hoje; nos outros dias, a passada', () => {
    expect(weekToShare('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(weekToShare('2026-11-04')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('mês: o mês passado inteiro (inclusive na virada do ano)', () => {
    expect(monthToShare('2026-11-04')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthToShare('2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('summarize', () => {
  const pse = (date: string, minutes: number, type = 'Treino Randori', rpe = 6) => ({
    date,
    training_type: type,
    rpe_score: rpe,
    duration_minutes: minutes,
    did_not_train: false,
  });

  it('semana: treinos, minutos, tipo mais frequente e comparação com a semana anterior', () => {
    const data = base({
      pse: [
        pse('2026-10-20', 50), // semana anterior: 50 min
        pse('2026-10-27', 60),
        pse('2026-10-28', 40, 'Treino Físico'),
        pse('2026-10-29', 50),
        { date: '2026-10-30', training_type: null, rpe_score: null, duration_minutes: null, did_not_train: true },
      ],
      dias_respondidos: ['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27'],
    });
    const s = summarize(data, 'semana');
    expect(s.titulo).toBe('26/10 a 01/11');
    expect(s.treinos).toBe(3);
    expect(s.minutos).toBe(150);
    expect(s.dias).toBe(4);
    expect(s.tipoPrincipal).toEqual({ tipo: 'Treino Randori', n: 2 });
    expect(s.variacaoMinutos).toBe(200);
  });

  it('mês: aponta a semana de maior carga, dentro do mês', () => {
    const data = base({ pse: [pse('2026-10-01', 30), pse('2026-10-14', 90, 'Treino Randori', 8), pse('2026-10-15', 60)] });
    const s = summarize(data, 'mes');
    expect(s.titulo).toBe('Outubro de 2026');
    expect(s.semanaForte).toEqual({ from: '2026-10-12', to: '2026-10-18', minutos: 150 });
  });
});

describe('selos', () => {
  const data = base({
    treinos: 12,
    marcos_treinos: { '10': '2026-11-02' },
    dias_respondidos: ['2026-11-04', '2026-11-03', '2026-11-02'],
    dias_treino: ['2026-11-04', '2026-11-03', '2026-11-02'],
  });
  const view = buildAchievements(data);

  it('10 treinos conquistado na data do 10º; 50 treinos com progresso', () => {
    const b10 = view.badges.find((b) => b.id === 'treinos-10')!;
    const b50 = view.badges.find((b) => b.id === 'treinos-50')!;
    expect(b10.unlocked).toBe(true);
    expect(b10.unlockedAt).toBe('2026-11-02');
    expect(b50.unlocked).toBe(false);
    expect(b50.progress).toEqual({ value: 12, target: 50 });
  });

  it('na tela: os conquistados e só o próximo de cada grupo', () => {
    const ids = visibleBadges(view.badges).map((b) => b.id);
    expect(ids).toContain('treinos-10');
    expect(ids).toContain('treinos-50');
    expect(ids).not.toContain('treinos-100');
    expect(ids).toContain('sequencia-7');
    expect(ids).not.toContain('sequencia-30');
  });

  it('selo novo: dos últimos 7 dias e ainda não visto', () => {
    expect(newestBadge(view.badges, '2026-11-04', new Set())?.id).toBe('treinos-10');
    expect(newestBadge(view.badges, '2026-11-04', new Set(['treinos-10']))).toBeNull();
    expect(newestBadge(view.badges, '2026-11-20', new Set())).toBeNull();
  });

  it('peso: sem categoria com limite, o selo não aparece', () => {
    const semPeso = buildBadges(base({ categoria: '+100' }), computeStreak([], [], '2026-11-04'));
    expect(semPeso.some((b) => b.group === 'peso')).toBe(false);
  });
});
