import { addDaysISO } from './date';
import { TrainingSession } from '../types';

const WEEKDAYS = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

const hm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/** Dia da semana de uma data AAAA-MM-DD (sem depender do fuso do aparelho). */
function weekdayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Programação da semana em texto (para mandar por WhatsApp), de segunda a domingo:
 *   Segunda-Feira 23/11
 *   08:00–10:00 Treino de força
 *   Terça-Feira 24/11
 *   Sem treinos.
 * Recebe só os treinos que valem para o atleta (o filtro do público fica com quem chama).
 */
export function weekScheduleText(weekStart: string, sessions: Pick<TrainingSession, 'date' | 'start_time' | 'end_time' | 'name'>[]): string {
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDaysISO(weekStart, i);
    const [, m, d] = day.split('-');
    lines.push(`${weekdayName(day)} ${d}/${m}`);
    const mine = sessions
      .filter((s) => s.date === day)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    if (mine.length === 0) lines.push('Sem treinos.');
    for (const s of mine) {
      const time = s.end_time ? `${hm(s.start_time)}–${hm(s.end_time)}` : hm(s.start_time);
      lines.push(`${time} ${s.name.trim()}`.trim());
    }
  }
  return lines.join('\n');
}
