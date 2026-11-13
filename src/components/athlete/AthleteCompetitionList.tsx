import React, { useEffect, useState } from 'react';
import { MapPin, Share2, Tent, Trophy } from 'lucide-react';
import { AthleteCompetition, eventEndDate, fieldTrainingRange, isFieldTraining, listAthleteCompetitions } from '../../lib/competitions';
import { daysBetweenISO } from '../../lib/weightPlan';
import { useShareStory } from './ShareStory';

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Próximas competições do atleta, na Agenda (some quando não há nenhuma). */
export const AthleteCompetitionList: React.FC<{ token: string; today: string }> = ({ token, today }) => {
  const share = useShareStory();
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

  // Só as 3 próximas (a Agenda não fica comprida); treinamento de campo fica até o último dia
  const upcoming = list
    .filter((c) => eventEndDate(c) >= today)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 3);
  if (upcoming.length === 0) return null;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
      <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5" /> {upcoming.some(isFieldTraining) ? 'Próximas competições e treinamentos de campo' : 'Próximas competições'}
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
            <div className="flex items-start gap-1 flex-shrink-0">
              <div className="text-right text-slate-400">
                {isFieldTraining(c) || !c.data_pesagem ? (
                  <>
                    <p className="text-emerald-300 flex items-center justify-end gap-1">
                      <Tent className="w-3 h-3" /> Treinamento de campo
                    </p>
                    <p className="text-slate-500">{fieldTrainingRange(c)}</p>
                  </>
                ) : (
                  <>
                    <p>Competição {br(c.data)}</p>
                    <p className="text-slate-500">
                      Pesagem {br(c.data_pesagem)}
                      {c.hora_pesagem ? ` ${c.hora_pesagem.slice(0, 5)}` : ''}
                    </p>
                  </>
                )}
              </div>
              {share && !isFieldTraining(c) && (
                <button
                  type="button"
                  onClick={() =>
                    share.openStory({ kind: 'competicao', nome: c.nome, data: c.data, dias: daysBetweenISO(today, c.data), local: c.local, categoria: c.categoria })
                  }
                  className="p-1.5 text-slate-400 hover:text-sky-300"
                  title="Compartilhar a contagem"
                  aria-label={`Compartilhar a contagem para ${c.nome}`}
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
