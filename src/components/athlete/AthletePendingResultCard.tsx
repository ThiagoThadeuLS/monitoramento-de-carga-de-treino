import React from 'react';
import { ChevronRight, Trophy } from 'lucide-react';
import { AthleteCompetitionResult } from '../../lib/competitions';

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Aviso discreto no "Hoje": competição passada ainda sem resultado.
 * Fica até o atleta registrar, sem bloquear nada do app.
 */
export const AthletePendingResultCard: React.FC<{
  pending: AthleteCompetitionResult[];
  onRegister: (competition: AthleteCompetitionResult) => void;
}> = ({ pending, onRegister }) => {
  if (pending.length === 0) return null;
  const next = pending[0];
  const others = pending.length - 1;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-sky-500/5 p-3.5 flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center flex-shrink-0">
        <Trophy className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300">Resultado pendente</p>
        <p className="text-sm font-bold text-white break-words">Como foi a {next.nome}?</p>
        <p className="text-[11px] text-slate-400">
          {shortDate(next.data)} • leva menos de um minuto
          {others > 0 ? ` • mais ${others} na Agenda` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRegister(next)}
        className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1 flex-shrink-0"
      >
        Registrar <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </section>
  );
};
