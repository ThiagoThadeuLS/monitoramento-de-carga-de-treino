/**
 * Data de hoje (AAAA-MM-DD) no fuso do aparelho.
 * Não use toISOString(): ela usa UTC e, no Brasil, vira o dia seguinte após as 21h.
 */
export function todayLocalISO(): string {
  return toLocalISO(new Date());
}

function toLocalISO(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toLocalISO(new Date(y, m - 1, d + days));
}

/** Segunda-feira da semana da data informada. */
export function startOfWeekISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return addDaysISO(iso, weekday === 0 ? -6 : 1 - weekday);
}

/** Semanas visíveis no cronograma: a anterior, a atual e a próxima (segundas-feiras). */
export function scheduleWeekBounds(today = todayLocalISO()) {
  const current = startOfWeekISO(today);
  return {
    minWeek: addDaysISO(current, -7),
    maxWeek: addDaysISO(current, 7),
    minDate: addDaysISO(current, -7),
    maxDate: addDaysISO(current, 13),
  };
}
