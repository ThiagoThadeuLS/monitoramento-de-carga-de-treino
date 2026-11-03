import React, { useEffect, useState } from 'react';
import { MapPin, Trophy } from 'lucide-react';
import { AthleteCompetition, listAthleteCompetitions } from '../../lib/competitions';

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Próximas competições do atleta, na Agenda (some quando não há nenhuma). */
export const AthleteCompetitionList: React.FC<{ token: string; today: string }> = ({ token, today }) => {
  const [list, setList] = useState<AthleteCompetition[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAthleteCompetitions(token)
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [token, today]);

  const upcoming = list.filter((c) => c.data >= today).sort((a, b) => a.data.localeCompare(b.data));
  if (upcoming.length === 0) return null;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
      <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5" /> Próximas competições
      </p>
      <ul className="space-y-1.5">
        {upcoming.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{c.nome}</p>
              {c.local && (
                <p className="text-slate-500 flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0" /> {c.local}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0 text-slate-400">
              <p>Competição {br(c.data)}</p>
              <p className="text-slate-500">
                Pesagem {br(c.data_pesagem)}
                {c.hora_pesagem ? ` ${c.hora_pesagem.slice(0, 5)}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
