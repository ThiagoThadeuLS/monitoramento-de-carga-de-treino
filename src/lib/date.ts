/**
 * Datas e horas do app: tudo no horário de Brasília, o mesmo fuso do banco
 * (training_today) e do cronograma. Assim um atleta competindo no exterior registra
 * no mesmo "dia" do treino programado, e o banco nunca recusa por diferença de fuso.
 *
 * Datas viajam como texto AAAA-MM-DD. Não use toISOString() para obter "hoje":
 * ela usa UTC e, no Brasil, vira o dia seguinte após as 21h.
 */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Data AAAA-MM-DD do instante informado, no horário de Brasília. */
export function dateInAppZone(d: Date): string {
  return dateFmt.format(d);
}

/** Hora HH:MM do instante informado, no horário de Brasília. */
export function timeInAppZone(d: Date): string {
  return timeFmt.format(d);
}

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
export function todayISO(): string {
  return dateInAppZone(new Date());
}

/** Hora atual (HH:MM) no horário de Brasília. */
export function nowTimeHM(): string {
  return timeInAppZone(new Date());
}

/** Data e hora (AAAA-MM-DD, HH:MM) de um envio, no horário de Brasília. */
export function stampInAppZone(iso?: string | null): [string, string] {
  if (!iso) return ['', ''];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ['', ''];
  return [dateInAppZone(d), timeInAppZone(d)];
}

// Contas com datas em UTC puro: sem horário de verão nem fuso do aparelho no meio.
function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD. */
export function addDaysISO(iso: string, days: number): string {
  return formatUTC(parseISO(iso) + days * 86_400_000);
}

/** Segunda-feira da semana da data informada. */
export function startOfWeekISO(iso: string): string {
  const weekday = new Date(parseISO(iso)).getUTCDay(); // 0 = domingo
  return addDaysISO(iso, weekday === 0 ? -6 : 1 - weekday);
}

/** Semanas visíveis no cronograma: a anterior, a atual e a próxima (segundas-feiras). */
export function scheduleWeekBounds(today = todayISO()) {
  const current = startOfWeekISO(today);
  return {
    minWeek: addDaysISO(current, -7),
    maxWeek: addDaysISO(current, 7),
    minDate: addDaysISO(current, -7),
    maxDate: addDaysISO(current, 13),
  };
}
