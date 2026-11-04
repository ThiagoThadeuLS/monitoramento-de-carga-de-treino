export const CLASSES = ['Sênior', 'Junior', 'Juvenil'];

// Mesmos tipos que o atleta escolhe na PSE (permite comparar planejado x respondido)
export const TRAINING_TYPES = ['Treino Técnico', 'Treino Randori', 'Treino Físico'];

/** Tipo de treino que tem ficha de preparação física (exercícios, PRs, cronômetro). */
export const PHYSICAL_TRAINING = 'Treino Físico';

/** O treino é de preparação física? (aceita com ou sem acento) */
export const isPhysicalTraining = (type?: string | null) =>
  (type ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('fisico');

/** Escala de PSE (Foster, 1 a 10): nome e cor de cada nota. A mesma no formulário e na figurinha do treino. */
export const PSE_SCALE: Record<number, { text: string; color: string }> = {
  1: { text: 'Muito, Muito Fácil', color: '#10b981' },
  2: { text: 'Muito Fácil', color: '#10b981' },
  3: { text: 'Fácil', color: '#22c55e' },
  4: { text: 'Moderado', color: '#eab308' },
  5: { text: 'Um Pouco Difícil', color: '#f59e0b' },
  6: { text: 'Difícil', color: '#f59e0b' },
  7: { text: 'Muito Difícil', color: '#f97316' },
  8: { text: 'Muito, Muito Difícil', color: '#f43f5e' },
  9: { text: 'Quase Máximo / Exaustivo', color: '#ef4444' },
  10: { text: 'Máximo Absoluto', color: '#dc2626' },
};
