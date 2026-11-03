export type TrainingKind = 'fisico' | 'tecnico' | 'randori' | 'outro';

function norm(s?: string | null) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // tira acentos
}

export function getTrainingKind(nome?: string | null): TrainingKind {
  const n = norm(nome);

  // Randori / combate / luta livre
  if (
    /\brandori\b/.test(n) ||
    /\bcombate\b/.test(n) ||
    /\bsparring\b/.test(n) ||
    /\bluta livre\b/.test(n) ||
    /\brolagem\b/.test(n) ||
    /\bne waza\b/.test(n) ||
    /\bnewaza\b/.test(n) ||
    /\bfree fight\b/.test(n)
  ) {
    return 'randori';
  }

  // Físico / preparação física
  if (
    /\bfisic/.test(n) ||        // fisico / física
    /\bpft\b/.test(n) ||
    /\bpreparacao\b/.test(n) ||
    /\bcondicion/.test(n) ||
    /\bforca\b/.test(n) ||
    /\bmuscul/.test(n) ||
    /\bcardio\b/.test(n) ||
    /\baerob/.test(n) ||
    /\banerob/.test(n)
  ) {
    return 'fisico';
  }

  // Técnico
  if (
    /\btecnic/.test(n) ||      // tecnico / técnica
    /\bfundament/.test(n) ||
    /\bdrill/.test(n) ||
    /\bpassagem\b/.test(n) ||
    /\bqueda\b/.test(n) ||
    /\btachi waza\b/.test(n) ||
    /\bnage waza\b/.test(n) ||
    /\bkatame waza\b/.test(n) ||
    /\bgoshin\b/.test(n)
  ) {
    return 'tecnico';
  }

  return 'outro';
}

export function isCombatKind(k: TrainingKind) {
  return k === 'randori';
}

export function isPhysicalKind(k: TrainingKind) {
  return k === 'fisico';
}

export function isTechnicalKind(k: TrainingKind) {
  return k === 'tecnico';
}
