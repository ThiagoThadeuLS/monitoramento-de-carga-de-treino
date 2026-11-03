/**
 * Qual treino do dia cada PSE responde. Mesma regra na tela "Hoje" do atleta e no
 * relatório "Sem resposta" do treinador:
 *   1. Cada PSE com tipo de treino (inclusive "Não treinei" enviado a partir de um treino)
 *      marca o próximo treino daquele tipo, na ordem do horário.
 *   2. "Não treinei" sem tipo (enviado sem escolher um treino) vale para o dia todo:
 *      marca todos os treinos que sobraram.
 */
export interface MatchSession {
  id: string;
  training_type: string;
  start_time: string;
}

export interface MatchPse {
  training_type?: string | null;
  did_not_train: boolean;
  created_at?: string;
}

export function matchPseToSessions<S extends MatchSession, R extends MatchPse>(sessions: S[], records: R[]): Map<string, R> {
  const ordered = [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const recs = [...records].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const used = new Set<R>();
  const out = new Map<string, R>();

  for (const s of ordered) {
    const rec = recs.find((r) => !used.has(r) && !!r.training_type && r.training_type === s.training_type);
    if (rec) {
      used.add(rec);
      out.set(s.id, rec);
    }
  }

  const wholeDay = recs.find((r) => r.did_not_train && !r.training_type);
  if (wholeDay) {
    for (const s of ordered) if (!out.has(s.id)) out.set(s.id, wholeDay);
  }
  return out;
}
