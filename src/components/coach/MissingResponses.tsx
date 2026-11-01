import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { todayLocalISO } from '../../lib/date';
import { AthleteGroup, sessionAppliesTo } from '../../lib/groups';
import { PseRecord, PsrRecord, TrainingSession } from '../../types';

interface Props {
  days: string[];
  athletes: { id: string; nome: string; active?: boolean }[];
  /** null = todos os atletas */
  selected: Set<string> | null;
  groups: AthleteGroup[];
  sessions: TrainingSession[];
  pse: PseRecord[];
  psr: PsrRecord[];
}

type Status = 'faltou' | 'atrasado';
interface Row {
  key: string;
  date: string;
  athleteId: string;
  nome: string;
  what: string; // "PSR" ou "PSE • nome do treino"
  status: Status;
  sentAt?: string;
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hhmm = (t: string) => t.slice(0, 5);

/** Data e hora locais (AAAA-MM-DD, HH:MM) de um envio. */
function localStamp(iso?: string): [string, string] {
  if (!iso) return ['', ''];
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
}

/**
 * Quem não respondeu PSR/PSE até o fim do horário das notificações do clube
 * (definido pelo treinador na Agenda). Respeita o período e a seleção de atletas.
 */
export const MissingResponses: React.FC<Props> = ({ days, athletes, selected, groups, sessions, pse, psr }) => {
  const [deadline, setDeadline] = useState('22:00');
  const [showLate, setShowLate] = useState(true);

  useEffect(() => {
    supabase
      ?.from('club_reminder_settings')
      .select('notify_until')
      .maybeSingle()
      .then(({ data }) => data?.notify_until && setDeadline(hhmm(String(data.notify_until))));
  }, []);

  const rows = useMemo(() => {
    const today = todayLocalISO();
    const now = localStamp(new Date().toISOString())[1];
    const late = (date: string, created?: string) => {
      const [d, t] = localStamp(created);
      return d > date || (d === date && t > deadline);
    };
    const people = athletes.filter((a) => a.active !== false && (!selected || selected.has(a.id)));
    const out: Row[] = [];
    for (const date of days) {
      // Só dias cujo prazo já passou
      if (date > today || (date === today && now < deadline)) continue;
      const daySessions = sessions.filter((s) => s.date === date).sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (!daySessions.length) continue;
      for (const a of people) {
        const mine = daySessions.filter((s) => sessionAppliesTo(s, a.id, groups));
        if (!mine.length) continue;

        // PSR: uma por dia de treino
        const psrRec = psr.filter((r) => r.athlete_id === a.id && r.date === date).sort((x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? ''))[0];
        if (!psrRec) out.push({ key: `${date}-${a.id}-psr`, date, athleteId: a.id, nome: a.nome, what: 'PSR', status: 'faltou' });
        else if (late(date, psrRec.created_at))
          out.push({ key: `${date}-${a.id}-psr`, date, athleteId: a.id, nome: a.nome, what: 'PSR', status: 'atrasado', sentAt: psrRec.created_at });

        // PSE: uma por treino. "Não treinei" vale para o dia todo.
        const recs = pse.filter((r) => r.athlete_id === a.id && r.date === date).sort((x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? ''));
        const skipped = recs.find((r) => r.did_not_train);
        const used = new Set<PseRecord>();
        for (const s of mine) {
          const rec = skipped ?? recs.find((r) => !used.has(r) && r.training_type === s.training_type);
          if (rec && !skipped) used.add(rec);
          const what = `PSE • ${s.name}`;
          const key = `${date}-${a.id}-${s.id}`;
          if (!rec) out.push({ key, date, athleteId: a.id, nome: a.nome, what, status: 'faltou' });
          else if (late(date, rec.created_at)) out.push({ key, date, athleteId: a.id, nome: a.nome, what, status: 'atrasado', sentAt: rec.created_at });
        }
      }
    }
    return out.sort((x, y) => y.date.localeCompare(x.date) || x.nome.localeCompare(y.nome, 'pt-BR'));
  }, [days, athletes, selected, groups, sessions, pse, psr, deadline]);

  const visible = showLate ? rows : rows.filter((r) => r.status === 'faltou');
  const missing = rows.filter((r) => r.status === 'faltou').length;
  const lateCount = rows.length - missing;
  const sentTime = (iso?: string) => {
    const [d, t] = localStamp(iso);
    return d ? `${brDate(d)} ${t}` : '';
  };

  const badge = (r: Row) =>
    r.status === 'faltou' ? (
      <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-semibold whitespace-nowrap">Não respondeu</span>
    ) : (
      <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold whitespace-nowrap">
        Atrasado • {sentTime(r.sentAt)}
      </span>
    );

  return (
    <section data-tour="period-missing" className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <header className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
            <BellOff className="w-4 h-4 text-red-400" />
            Sem resposta até {deadline}
          </h3>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Prazo = fim do horário das notificações (Agenda). Segue o período e os atletas selecionados.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-slate-400">
            {missing} sem resposta{lateCount ? ` • ${lateCount} atrasada${lateCount === 1 ? '' : 's'}` : ''}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={showLate} onChange={(e) => setShowLate(e.target.checked)} className="accent-sky-500" />
            Mostrar atrasadas
          </label>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Todos responderam dentro do prazo neste período.</p>
      ) : (
        <>
          <ul className="sm:hidden divide-y divide-slate-800/60 max-h-[480px] overflow-y-auto">
            {visible.map((r) => (
              <li key={r.key} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-white text-sm truncate">{r.nome}</p>
                  <span className="text-xs text-slate-400">{brDate(r.date)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">{r.what}</span>
                  {badge(r)}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                <tr>
                  <th className="py-3 px-4">Dia</th>
                  <th className="py-3 px-3">Atleta</th>
                  <th className="py-3 px-3">Questionário</th>
                  <th className="py-3 px-4">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-xs whitespace-nowrap">{brDate(r.date)}</td>
                    <td className="py-3 px-3 font-bold text-white">{r.nome}</td>
                    <td className="py-3 px-3 text-xs">{r.what}</td>
                    <td className="py-3 px-4">{badge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
