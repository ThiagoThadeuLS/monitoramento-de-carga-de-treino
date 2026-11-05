/**
 * Idade e aniversário a partir da data de nascimento (AAAA-MM-DD).
 * Tudo em UTC para a data não escorregar um dia pelo fuso.
 */

const parseISO = (iso: string | null | undefined): { y: number; m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
};

/** Idade completa (em anos) na data informada; null se a data for inválida/futura. */
export function ageOn(birth: string | null | undefined, on: string): number | null {
  const b = parseISO(birth);
  const d = parseISO(on);
  if (!b || !d) return null;
  let age = d.y - b.y;
  if (d.m < b.m || (d.m === b.m && d.d < b.d)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** Hoje é o aniversário? (comparação de dia e mês; 29/02 só em ano bissexto) */
export function isBirthday(birth: string | null | undefined, on: string): boolean {
  const b = parseISO(birth);
  const d = parseISO(on);
  if (!b || !d) return false;
  return b.m === d.m && b.d === d.d;
}
