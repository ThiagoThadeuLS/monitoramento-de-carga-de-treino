/**
 * Data de hoje (AAAA-MM-DD) no fuso do aparelho.
 * Não use toISOString(): ela usa UTC e, no Brasil, vira o dia seguinte após as 21h.
 */
export function todayLocalISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
