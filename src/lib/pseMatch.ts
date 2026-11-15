/**
 * Qual treino do dia cada PSE responde. Mesma regra na tela "Hoje" do atleta e no
 * relatório "Sem resposta" do treinador:
 *   1. PSE vinculada a um treino (training_session_id) responde exatamente aquele treino.
 *   2. PSE antiga, sem vínculo, mas com tipo de treino marca o próximo treino daquele tipo,
 *      na ordem do horário.
 *   3. "Não treinei" antigo, sem vínculo e sem tipo, vale para o dia todo: marca os treinos
 *      que sobraram. Respostas novas sempre levam o treino (ou o tipo) quando existir treino
 *      no dia, então esse caso fica só para o histórico.
 */
export interface MatchSession {
  id: string;
  training_type: string;
  start_time: string;
}

export interface MatchPse {
  /** Treino exato que a PSE responde (respostas novas) */
  training_session_id?: string | null;
  training_type?: string | null;
  did_not_train: boolean;
  created_at?: string;
}

export function matchPseToSessions<S extends MatchSession, R extends MatchPse>(sessions: S[], records: R[]): Map<string, R> {
  const ordered = [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const recs = [...records].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const used = new Set<R>();
  const out = new Map<string, R>();
  const byId = new Map(ordered.map((s) => [s.id, s]));

  // 1. Vínculo explícito: a resposta é daquele treino, mesmo com outro treino do mesmo tipo no dia.
  for (const r of recs) {
    if (used.has(r) || !r.training_session_id) continue;
    const session = byId.get(r.training_session_id);
    if (session && !out.has(session.id)) {
      used.add(r);
      out.set(session.id, r);
    }
  }

  // 2. Respostas antigas (sem vínculo): casa pelo tipo, na ordem do horário.
  for (const s of ordered) {
    if (out.has(s.id)) continue;
    const rec = recs.find(
      (r) => !used.has(r) && !r.training_session_id && !!r.training_type && r.training_type === s.training_type
    );
    if (rec) {
      used.add(rec);
      out.set(s.id, rec);
    }
  }

  // 3. "Não treinei" antigo sem tipo: cobre o resto do dia.
  const wholeDay = recs.find((r) => !used.has(r) && !r.training_session_id && r.did_not_train && !r.training_type);
  if (wholeDay) {
    for (const s of ordered) if (!out.has(s.id)) out.set(s.id, wholeDay);
  }
  return out;
}
