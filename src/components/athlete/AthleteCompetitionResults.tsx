import React from 'react';
import { Camera, Pencil, Trophy } from 'lucide-react';
import {
  AthleteCompetitionResult,
  PLACEMENT_EMOJI,
  competitionPlacementLabel,
  competitionResultStoryCard,
  pastCompetitionResults,
} from '../../lib/competitions';
import { useShareStory } from './ShareStory';

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const fightLine = (result: NonNullable<AthleteCompetitionResult['result']>) => {
  if (result.lutas === null || result.lutas === undefined) return '';
  const parts = [`${result.lutas} luta${result.lutas === 1 ? '' : 's'}`];
  if (result.vitorias !== null && result.vitorias !== undefined)
    parts.push(`${result.vitorias} V`);
  if (result.derrotas !== null && result.derrotas !== undefined)
    parts.push(`${result.derrotas} D`);
  return parts.join(' • ');
};

/**
 * Agenda: competições passadas com o resultado do atleta.
 * Quem ainda não registrou ganha o botão; quem já registrou pode editar e compartilhar.
 */
export const AthleteCompetitionResults: React.FC<{
  rows: AthleteCompetitionResult[];
  today: string;
  onRegister: (competition: AthleteCompetitionResult) => void;
}> = ({ rows, today, onRegister }) => {
  const share = useShareStory();
  const past = pastCompetitionResults(rows, today);
  if (past.length === 0) return null;

  const pending = past.filter((row) => !row.result).length;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" /> Resultados de competições
        </p>
        {pending > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300">
            {pending} sem registro
          </span>
        )}
      </div>

      <ul className="divide-y divide-slate-800/70">
        {past.map((row) => {
          const result = row.result;
          const card = competitionResultStoryCard(row);
          return (
            <li key={row.competition_id} className="py-2.5 first:pt-1 last:pb-0 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white break-words">{row.nome}</p>
                <p className="text-[11px] text-slate-500">
                  {shortDate(row.data)}
                  {row.local ? ` • ${row.local}` : ''}
                </p>
                {result ? (
                  <p className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={result.colocacao !== null ? 'text-amber-200 font-bold' : 'text-slate-400'}>
                      {result.colocacao !== null ? `${PLACEMENT_EMOJI[result.colocacao]} ` : ''}
                      {competitionPlacementLabel(result.colocacao)}
                    </span>
                    {fightLine(result) && <span className="text-slate-500">{fightLine(result)}</span>}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">Resultado ainda não registrado.</p>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {card && share && (
                  <button
                    type="button"
                    onClick={() => share.openTrainingShare(card)}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-700 text-sky-300 hover:text-sky-200"
                    title="Foto com a medalha"
                    aria-label={`Foto com a medalha de ${row.nome}`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRegister(row)}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                    result
                      ? 'bg-slate-950 border border-slate-700 text-slate-300 hover:text-white'
                      : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                  }`}
                >
                  {result ? <Pencil className="w-3 h-3" /> : null}
                  {result ? 'Editar' : 'Registrar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
