export const CLASSES = ['Sênior', 'Junior', 'Juvenil'];

// Mesmos tipos que o atleta escolhe na PSE (permite comparar planejado x respondido)
export const TRAINING_TYPES = ['Treino Técnico', 'Treino Randori', 'Treino Físico'];

/** Tipo de treino que tem ficha de preparação física (exercícios, PRs, cronômetro). */
export const PHYSICAL_TRAINING = 'Treino Físico';

/** O treino é de preparação física? (aceita com ou sem acento) */
export const isPhysicalTraining = (type?: string | null) =>
  (type ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('fisico');
