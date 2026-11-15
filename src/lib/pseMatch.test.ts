import { describe, expect, it } from 'vitest';
import { matchPseToSessions } from './pseMatch';

const s = (id: string, training_type: string, start_time: string) => ({ id, training_type, start_time });
const manha = s('manha', 'Treino Técnico', '08:00');
const tarde = s('tarde', 'Treino Técnico', '17:00');
const fisico = s('fisico', 'Treino Físico', '10:00');

describe('matchPseToSessions', () => {
  it('PSE normal marca o próximo treino do mesmo tipo', () => {
    const m = matchPseToSessions([tarde, manha], [{ training_type: 'Treino Técnico', did_not_train: false, created_at: '1' }]);
    expect([...m.keys()]).toEqual(['manha']);
  });

  it('PSE com training_session_id marca exatamente aquele treino (mesmo tipo no dia)', () => {
    const m = matchPseToSessions(
      [manha, tarde],
      [{ training_session_id: 'tarde', training_type: 'Treino Técnico', did_not_train: false, created_at: '1' }]
    );
    expect([...m.keys()]).toEqual(['tarde']);
  });

  it('"Não treinei" com training_session_id não cobre o outro treino do dia', () => {
    const m = matchPseToSessions(
      [manha, tarde],
      [{ training_session_id: 'manha', training_type: 'Treino Técnico', did_not_train: true, created_at: '1' }]
    );
    expect(m.has('manha')).toBe(true);
    expect(m.has('tarde')).toBe(false);
  });

  it('o vínculo explícito vence a ordem dos treinos do mesmo tipo', () => {
    const m = matchPseToSessions(
      [manha, tarde],
      [
        { training_session_id: 'tarde', training_type: 'Treino Técnico', did_not_train: false, created_at: '2' },
        { training_type: 'Treino Técnico', did_not_train: false, created_at: '1' },
      ]
    );
    expect(m.get('tarde')?.created_at).toBe('2');
    expect(m.get('manha')?.created_at).toBe('1');
  });

  it('"Não treinei" enviado a partir de um treino marca só aquele treino', () => {
    const m = matchPseToSessions([manha, fisico], [{ training_type: 'Treino Físico', did_not_train: true, created_at: '1' }]);
    expect(m.has('fisico')).toBe(true);
    expect(m.has('manha')).toBe(false);
  });

  it('"Não treinei" sem tipo vale para o dia todo (respostas antigas)', () => {
    const m = matchPseToSessions([manha, fisico, tarde], [{ training_type: null, did_not_train: true, created_at: '1' }]);
    expect(m.size).toBe(3);
  });

  it('respostas com tipo ficam com o treino delas; o "dia todo" cobre o resto', () => {
    const m = matchPseToSessions(
      [manha, tarde],
      [
        { training_type: 'Treino Técnico', did_not_train: false, created_at: '1' },
        { training_type: undefined, did_not_train: true, created_at: '2' },
      ]
    );
    expect(m.get('manha')?.did_not_train).toBe(false);
    expect(m.get('tarde')?.did_not_train).toBe(true);
  });

  it('sem resposta: nenhum treino marcado', () => {
    expect(matchPseToSessions([manha], []).size).toBe(0);
  });
});
