import React from 'react';
import { Trophy } from 'lucide-react';
import { AthleteCompetitionResult, COMPETITION_PLACEMENTS, CompetitionPlacement, NO_PLACEMENT_LABEL, PLACEMENT_EMOJI, PLACEMENT_SHORT } from '../../lib/competitions';

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Caixa "Como foi a competição?" no Hoje, depois da data de cada competição.
 * O atleta toca no resultado (1º, 2º, 3º, 5º, 7º ou "Dessa vez não deu") e confirma.
 * Fica até ele registrar, sem bloquear nada do app.
 */
export const AthletePendingResultCard: React.FC<{
  pending: AthleteCompetitionResult[];
  onRegister: (competition: AthleteCompetitionResult, placement?: CompetitionPlacement | null) => void;
}> = ({ pending, onRegister }) => {
  if (pending.length === 0) return null;
  const next = pending[0];
  const others = pending.length - 1;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-sky-500/5 p-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300">Como foi a competição?</p>
          <p className="text-sm font-bold text-white break-words">{next.nome}</p>
          <p className="text-[11px] text-slate-400">
            {shortDate(next.data)}
            {others > 0 ? ` • mais ${others} na Agenda` : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Resultado em ${next.nome}`}>
        {COMPETITION_PLACEMENTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onRegister(next, p)}
            className="py-2 rounded-xl bg-slate-950/70 border border-slate-700 hover:border-amber-400/70 hover:bg-amber-500/10 text-sm font-black text-white flex items-center justify-center gap-1"
          >
            <span aria-hidden="true">{PLACEMENT_EMOJI[p]}</span> {PLACEMENT_SHORT[p]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onRegister(next, null)}
          className="py-2 px-1 rounded-xl bg-slate-950/70 border border-slate-700 hover:border-sky-400/70 hover:bg-sky-500/10 text-[11px] font-bold text-slate-200 leading-tight"
        >
          {NO_PLACEMENT_LABEL}
        </button>
      </div>
    </section>
  );
};
