import { MONOTONY_LIMIT, LoadMetrics, format2 } from './load';
import { matchPseToSessions } from './pseMatch';
import { PseRecord, PsrRecord, TrainingSession } from '../types';

// Tela "Hoje" do treinador: quem precisa de atenção no dia e por quê.

/** 3 = agir hoje, 2 = acompanhar, 1 = aviso */
export type AttentionLevel = 1 | 2 | 3;

export interface AttentionReason {
  kind: 'acwr' | 'monotonia' | 'dor' | 'fadiga' | 'psr' | 'esforco' | 'nao_treinou' | 'sem_resposta' | 'notificacao';
  label: string;
  level: AttentionLevel;
  /** Texto extra (motivo do "não treinei", qual questionário falta...) */
  detail?: string;
}

const hm = (t: string) => t.slice(0, 5);
const plusMinutes = (t: string, m: number) => {
  const total = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + m;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * O que o atleta ainda não respondeu no dia. No dia de hoje só cobra o que já deveria
 * ter chegado: a PSR depois do início do primeiro treino e a PSE 20 min depois do fim de cada treino.
 */
export function pendingForDay(input: {
  date: string;
  today: string;
  /** HH:MM no horário de Brasília */
  now: string;
  /** Treinos do dia destinados a este atleta */
  sessions: TrainingSession[];
  pse: PseRecord[];
  psr?: PsrRecord;
}): { psr: boolean; sessions: TrainingSession[] } {
  const { date, today, now, sessions, pse, psr } = input;
  if (!sessions.length || date > today) return { psr: false, sessions: [] };
  const ordered = [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const isToday = date === today;
  const matched = matchPseToSessions(ordered, pse);
  const missingPse = ordered.filter((s) => {
    if (matched.has(s.id)) return false;
    if (!isToday) return true;
    const end = s.end_time ? hm(s.end_time) : plusMinutes(hm(s.start_time), 90);
    return now >= plusMinutes(end, 20);
  });
  const psrDue = !isToday || now >= hm(ordered[0].start_time);
  return { psr: !psr && psrDue, sessions: missingPse };
}

/** Motivos de atenção de um atleta no dia, do mais grave para o mais leve. */
export function attentionReasons(input: {
  load?: LoadMetrics | null;
  pse: PseRecord[];
  psr?: PsrRecord;
  pending?: { psr: boolean; sessions: TrainingSession[] };
  /** Texto do problema de notificação (null = recebendo) */
  push?: string | null;
}): AttentionReason[] {
  const { load, pse, psr, pending, push } = input;
  const out: AttentionReason[] = [];

  if (load?.zone === 'risco' && !load.insufficient) out.push({ kind: 'acwr', label: `ACWR ${format2(load.acwr)}`, level: 3, detail: 'Carga subiu rápido (acima de 1,5)' });
  if (psr && psr.muscle_soreness_score <= 3) out.push({ kind: 'dor', label: 'Dor muscular', level: 3, detail: `Dor ${psr.muscle_soreness_score}/10` });
  if (load && (load.monotony ?? 0) > MONOTONY_LIMIT) out.push({ kind: 'monotonia', label: `Monotonia ${format2(load.monotony)}`, level: 2, detail: 'Semana pouco variada' });
  if (psr && psr.fatigue_score <= 3) out.push({ kind: 'fadiga', label: 'Fadiga alta', level: 2, detail: `Fadiga ${psr.fatigue_score}/10` });
  if (psr && psr.psr_score < 5) out.push({ kind: 'psr', label: `PSR ${psr.psr_score}`, level: 2, detail: 'Pouco recuperado' });
  if (pse.some((p) => !p.did_not_train && (p.rpe_score ?? 0) >= 9)) out.push({ kind: 'esforco', label: 'Esforço máximo', level: 1, detail: 'PSE 9 ou 10' });

  const notTrained = pse.find((p) => p.did_not_train);
  if (notTrained) out.push({ kind: 'nao_treinou', label: 'Não treinou', level: 1, detail: notTrained.observations || undefined });

  if (pending && (pending.psr || pending.sessions.length)) {
    const what = [pending.psr && 'PSR', ...pending.sessions.map((s) => `PSE ${s.name}`)].filter(Boolean).join(', ');
    out.push({ kind: 'sem_resposta', label: 'Sem resposta', level: 1, detail: what });
  }
  if (push) out.push({ kind: 'notificacao', label: 'Notificação parada', level: 1, detail: push });

  return out.sort((a, b) => b.level - a.level);
}

/** Nível mais alto entre os motivos (0 = nada). */
export const attentionLevel = (reasons: AttentionReason[]): number => reasons.reduce((max, r) => Math.max(max, r.level), 0);
