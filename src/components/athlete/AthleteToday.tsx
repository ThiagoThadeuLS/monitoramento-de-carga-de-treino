import React from 'react';
import { CheckCircle2, ChevronRight, Clock, Dumbbell, Flame, HeartPulse, Loader2, Plus, RefreshCw, Scale } from 'lucide-react';
import { AthleteHome, HomeSession } from '../../lib/athleteAuth';
import { isPhysicalTraining } from '../../data/constants';
import { timeOfStamp } from '../../lib/date';
import { matchPseToSessions } from '../../lib/pseMatch';

export type TodayAction =
  | { kind: 'psr' }
  | { kind: 'peso' }
  | { kind: 'pse'; trainingType?: string; duration?: number }
  | { kind: 'treino'; id: string; name: string };

interface Props {
  home: AthleteHome | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onAction: (a: TodayAction) => void;
  /** Cartão da próxima competição (fica no alto quando existir) */
  competitionCard?: React.ReactNode;
}

const kg = (v: number) => `${v.toFixed(1).replace('.', ',')} kg`;
const hm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/** Duração programada do treino (fim - início), em minutos */
export function sessionMinutes(s: { start_time: string; end_time?: string | null }): number | undefined {
  if (!s.end_time) return undefined;
  const [h1, m1] = s.start_time.split(':').map(Number);
  const [h2, m2] = s.end_time.split(':').map(Number);
  const min = h2 * 60 + m2 - (h1 * 60 + m1);
  return min > 0 ? min : undefined;
}

/** Quais treinos do dia já têm PSE (mesma regra do relatório do treinador). */
function answeredSessions(home: AthleteHome): Set<string> {
  return new Set(matchPseToSessions(home.sessions, home.pse).keys());
}

const Row: React.FC<{
  icon: React.ElementType;
  color: string;
  title: string;
  detail: React.ReactNode;
  done: boolean;
  action?: { label: string; onClick: () => void };
  extra?: React.ReactNode;
}> = ({ icon: Icon, color, title, detail, done, action, extra }) => (
  <div
    className={`rounded-2xl border p-4 flex items-center gap-3 ${
      done ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-900/90 border-slate-700'
    }`}
  >
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500/10' : 'bg-slate-800'}`}>
      {done ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Icon className={`w-5 h-5 ${color}`} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className={`text-sm font-bold ${done ? 'text-slate-400' : 'text-white'}`}>{title}</p>
      <div className="text-xs text-slate-400">{detail}</div>
    </div>
    <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
      {extra}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 ${
            done ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
          }`}
        >
          {action.label}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
);

/** Tela "Hoje": o que falta responder e os treinos do dia, numa lista só. */
export const AthleteToday: React.FC<Props> = ({ home, loading, error, onReload, onAction, competitionCard }) => {
  if (!home) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
        {error ? (
          <>
            <p className="text-sm text-amber-300 text-center">{error}</p>
            <button type="button" onClick={onReload} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Tentar de novo
            </button>
          </>
        ) : (
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        )}
      </div>
    );
  }

  const answered = answeredSessions(home);
  const pending = (home.psr ? 0 : 1) + (home.weighDay && !home.weight ? 1 : 0) + home.sessions.filter((s) => !answered.has(s.id)).length;

  const sessionRow = (s: HomeSession) => {
    const physical = isPhysicalTraining(s.training_type);
    const done = answered.has(s.id);
    return (
      <Row
        key={s.id}
        icon={physical ? Dumbbell : Flame}
        color={physical ? 'text-violet-300' : 'text-orange-400'}
        title={s.name || s.training_type}
        done={done}
        detail={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {hm(s.start_time)}
              {s.end_time ? `–${hm(s.end_time)}` : ''}
            </span>
            <span>{s.training_type}</span>
            {done && <span className="text-emerald-400">PSE enviada</span>}
          </span>
        }
        extra={
          physical ? (
            <button
              type="button"
              onClick={() => onAction({ kind: 'treino', id: s.id, name: s.name || 'Treino Físico' })}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-500/15 border border-violet-500/40 text-violet-200 hover:bg-violet-500/25"
            >
              {s.completed ? 'Ver ficha' : 'Abrir ficha'}
            </button>
          ) : undefined
        }
        action={
          done
            ? undefined
            : { label: 'PSE', onClick: () => onAction({ kind: 'pse', trainingType: s.training_type, duration: sessionMinutes(s) }) }
        }
      />
    );
  };

  return (
    <div className="space-y-5">
      {competitionCard}

      <section data-tour="athlete-today" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-wide">
            Para hoje {pending > 0 ? <span className="text-amber-300">• falta{pending > 1 ? 'm' : ''} {pending}</span> : <span className="text-emerald-400">• tudo em dia</span>}
          </h2>
          <button type="button" onClick={onReload} disabled={loading} className="p-2 text-slate-400 hover:text-white disabled:opacity-50" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <Row
          icon={HeartPulse}
          color="text-emerald-400"
          title="Bem-estar (PSR)"
          done={!!home.psr}
          detail={home.psr ? `Respondido às ${timeOfStamp(home.psr.created_at)}` : 'Uma vez por dia, antes do primeiro treino'}
          action={home.psr ? undefined : { label: 'Responder', onClick: () => onAction({ kind: 'psr' }) }}
        />

        {(home.weighDay || home.weight) && (
          <Row
            icon={Scale}
            color="text-sky-400"
            title="Peso (dia de pesagem)"
            done={!!home.weight}
            detail={
              home.weight
                ? `${kg(home.weight.weight)} registrado`
                : home.lastWeight
                ? `Último: ${kg(home.lastWeight.weight)}`
                : 'Hoje é dia de pesagem do clube'
            }
            action={home.weight ? undefined : { label: 'Registrar', onClick: () => onAction({ kind: 'peso' }) }}
          />
        )}

        {home.sessions.map(sessionRow)}

        {home.sessions.length === 0 && (
          <p className="text-xs text-slate-500 px-1">Nenhum treino programado para você hoje.</p>
        )}

        <button
          type="button"
          onClick={() => onAction({ kind: 'pse' })}
          className="w-full py-3 rounded-2xl border border-dashed border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {home.pse.length > 0 ? `PSE de outro treino (${home.pse.length} enviada${home.pse.length > 1 ? 's' : ''} hoje)` : 'PSE de outro treino'}
        </button>
      </section>
    </div>
  );
};
