import { describe, expect, it } from 'vitest';
import {
  AthleteCompetitionResult,
  CompetitionResult,
  CompetitionResultOverviewRow,
  competitionPlacementLabel,
  competitionResultStatsBy,
  competitionResultStoryCard,
  isCompetitionPlacement,
  parseCompetitionPlacement,
  pastCompetitionResults,
  pendingCompetitionResults,
  summarizeCompetitionResults,
} from './competitionResults';

const result = (overrides: Partial<CompetitionResult> = {}): CompetitionResult => ({
  id: 'r1',
  colocacao: 1,
  lutas: null,
  vitorias: null,
  derrotas: null,
  ...overrides,
});

const athleteRow = (overrides: Partial<AthleteCompetitionResult> = {}): AthleteCompetitionResult => ({
  competition_id: 'c1',
  nome: 'Copa do Clube',
  data: '2026-11-01',
  data_pesagem: '2026-10-31',
  local: 'Ginásio Municipal',
  categoria: '-66',
  result: null,
  ...overrides,
});

const overviewRow = (overrides: Partial<CompetitionResultOverviewRow> = {}): CompetitionResultOverviewRow => ({
  athlete_id: 'a1',
  athlete_nome: 'Ana',
  competition_id: 'c1',
  competition_nome: 'Copa do Clube',
  competition_data: '2026-11-01',
  colocacao: 1,
  lutas: null,
  vitorias: null,
  derrotas: null,
  ...overrides,
});

describe('colocações', () => {
  it('aceita só 1, 2, 3, 5 e 7', () => {
    expect(isCompetitionPlacement(1)).toBe(true);
    expect(isCompetitionPlacement(3)).toBe(true);
    expect(isCompetitionPlacement(7)).toBe(true);
    expect(isCompetitionPlacement(4)).toBe(false);
    expect(isCompetitionPlacement(0)).toBe(false);
    expect(isCompetitionPlacement('1')).toBe(false);
  });

  it('converte texto do banco e trata qualquer outro valor como sem colocação', () => {
    expect(parseCompetitionPlacement('3')).toBe(3);
    expect(parseCompetitionPlacement(5)).toBe(5);
    expect(parseCompetitionPlacement(4)).toBeNull();
    expect(parseCompetitionPlacement(null)).toBeNull();
    expect(parseCompetitionPlacement('abc')).toBeNull();
  });

  it('rotula também o resultado sem colocação', () => {
    expect(competitionPlacementLabel(1)).toBe('1º lugar');
    expect(competitionPlacementLabel(7)).toBe('7º lugar');
    expect(competitionPlacementLabel(null)).toBe('Sem colocação');
  });
});

describe('summarizeCompetitionResults', () => {
  it('conta cada colocação, o sem colocação e as lutas', () => {
    const stats = summarizeCompetitionResults([
      overviewRow({ colocacao: 1, lutas: 3, vitorias: 3, derrotas: 0 }),
      overviewRow({ athlete_id: 'a2', colocacao: 2, lutas: 4, vitorias: 2, derrotas: 2 }),
      overviewRow({ athlete_id: 'a3', colocacao: 3, lutas: 2, vitorias: 1, derrotas: 1 }),
      overviewRow({ athlete_id: 'a4', colocacao: 5 }),
      overviewRow({ athlete_id: 'a5', colocacao: 7 }),
      overviewRow({ athlete_id: 'a6', colocacao: null }),
    ]);

    expect(stats.total).toBe(6);
    expect(stats.comColocacao).toBe(5);
    expect(stats.semColocacao).toBe(1);
    expect(stats.porColocacao).toEqual({ 1: 1, 2: 1, 3: 1, 5: 1, 7: 1 });
    expect(stats.lutas).toBe(9);
    expect(stats.vitorias).toBe(6);
    expect(stats.derrotas).toBe(3);
    expect(stats.aproveitamento).toBeCloseTo(6 / 9);
  });

  it('sem lutas informadas, o aproveitamento fica nulo', () => {
    const stats = summarizeCompetitionResults([overviewRow(), overviewRow({ athlete_id: 'a2', colocacao: null })]);
    expect(stats.lutas).toBe(0);
    expect(stats.aproveitamento).toBeNull();
  });

  it('lista vazia zera tudo', () => {
    const stats = summarizeCompetitionResults([]);
    expect(stats).toEqual({
      total: 0,
      comColocacao: 0,
      semColocacao: 0,
      porColocacao: { 1: 0, 2: 0, 3: 0, 5: 0, 7: 0 },
      lutas: 0,
      vitorias: 0,
      derrotas: 0,
      aproveitamento: null,
    });
  });
});

describe('competitionResultStatsBy', () => {
  it('agrupa por competição e por atleta', () => {
    const rows = [
      overviewRow({ competition_id: 'c1', athlete_id: 'a1', colocacao: 1 }),
      overviewRow({ competition_id: 'c1', athlete_id: 'a2', colocacao: 2 }),
      overviewRow({ competition_id: 'c2', athlete_id: 'a1', colocacao: null }),
    ];

    const byCompetition = competitionResultStatsBy(rows, 'competition_id');
    expect(byCompetition.get('c1')?.total).toBe(2);
    expect(byCompetition.get('c2')?.semColocacao).toBe(1);

    const byAthlete = competitionResultStatsBy(rows, 'athlete_id');
    expect(byAthlete.get('a1')?.total).toBe(2);
    expect(byAthlete.get('a2')?.porColocacao[2]).toBe(1);
  });
});

describe('pastCompetitionResults', () => {
  it('só competições passadas, da mais recente para a mais antiga', () => {
    const rows = [
      athleteRow({ competition_id: 'futura', data: '2026-12-01' }),
      athleteRow({ competition_id: 'antiga', data: '2026-09-01' }),
      athleteRow({ competition_id: 'hoje', data: '2026-11-03' }),
    ];
    expect(pastCompetitionResults(rows, '2026-11-03').map((r) => r.competition_id)).toEqual(['hoje', 'antiga']);
  });
});

describe('pendingCompetitionResults', () => {
  it('inclui passadas sem resultado dentro da janela e ignora resultado sem colocação', () => {
    const rows = [
      athleteRow({ competition_id: 'pendente', data: '2026-10-20' }),
      athleteRow({ competition_id: 'sem-colocacao', data: '2026-10-25', result: result({ colocacao: null }) }),
      athleteRow({ competition_id: 'colocado', data: '2026-10-26', result: result({ colocacao: 3 }) }),
      athleteRow({ competition_id: 'antiga', data: '2026-01-01' }),
      athleteRow({ competition_id: 'futura', data: '2026-12-01' }),
    ];
    expect(pendingCompetitionResults(rows, '2026-11-03').map((r) => r.competition_id)).toEqual(['pendente']);
  });

  it('aceita uma janela maior na Agenda', () => {
    const rows = [athleteRow({ competition_id: 'antiga', data: '2026-01-01' })];
    expect(pendingCompetitionResults(rows, '2026-11-03')).toEqual([]);
    expect(pendingCompetitionResults(rows, '2026-11-03', 365).map((r) => r.competition_id)).toEqual(['antiga']);
  });
});

describe('competitionResultStoryCard', () => {
  it('monta o cartão só quando há colocação', () => {
    const card = competitionResultStoryCard(
      athleteRow({ result: result({ colocacao: 2, lutas: 4, vitorias: 3, derrotas: 1 }) })
    );
    expect(card).toMatchObject({
      kind: 'resultado',
      nome: 'Copa do Clube',
      data: '2026-11-01',
      local: 'Ginásio Municipal',
      categoria: '-66',
      colocacao: 2,
      lutas: 4,
      vitorias: 3,
      derrotas: 1,
    });
  });

  it('não gera cartão para sem colocação nem para resultado pendente', () => {
    expect(competitionResultStoryCard(athleteRow({ result: result({ colocacao: null }) }))).toBeNull();
    expect(competitionResultStoryCard(athleteRow())).toBeNull();
  });
});
