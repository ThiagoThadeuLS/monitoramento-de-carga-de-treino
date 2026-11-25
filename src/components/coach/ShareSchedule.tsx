import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, Loader2, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, startOfWeekISO } from '../../lib/date';
import { useTodayISO } from '../../lib/useToday';
import { sessionAppliesTo, useClubGroups } from '../../lib/groups';
import { weekScheduleText } from '../../lib/weekSchedule';
import { TrainingSession } from '../../types';
import { useDialogs } from '../ui/Dialogs';

/**
 * Programação da semana do atleta em texto (para atleta visitante, que não usa o app).
 * Só entram os treinos que valem para ele (mesma regra do público do treino) e só o
 * nome e o horário: as anotações não vão no texto.
 */
export const ShareSchedule: React.FC<{ athleteId: string; athleteName: string; onClose: () => void }> = ({ athleteId, athleteName, onClose }) => {
  const { notify } = useDialogs();
  const today = useTodayISO();
  const thisWeek = startOfWeekISO(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const { groups } = useClubGroups();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const weekEnd = addDaysISO(weekStart, 6);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('training_sessions')
      .select('*')
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
      .order('start_time')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(`Não foi possível carregar os treinos: ${err.message}`);
        setSessions((data ?? []) as TrainingSession[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd]);

  const text = useMemo(
    () => weekScheduleText(weekStart, sessions.filter((s) => sessionAppliesTo(s, athleteId, groups))),
    [weekStart, sessions, athleteId, groups],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Programação copiada. É só colar no WhatsApp.', 'success');
    } catch {
      notify('Não foi possível copiar. Selecione o texto e copie.', 'error');
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ text });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') copy();
    }
  };

  const weeks = [
    { start: thisWeek, label: 'Esta semana' },
    { start: addDaysISO(thisWeek, 7), label: 'Próxima semana' },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compartilhar programação"
        className="bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-sky-300" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">Programação da semana</h3>
            <p className="text-[11px] text-slate-400 truncate">{athleteName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex gap-1.5">
          {weeks.map((w) => (
            <button
              key={w.start}
              type="button"
              onClick={() => setWeekStart(w.start)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                weekStart === w.start ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-300">{error}</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-200 bg-slate-900 border border-slate-800 rounded-xl p-3 font-sans select-text">{text}</pre>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={copy}
            disabled={loading || !!error}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold disabled:opacity-50"
          >
            <Copy className="w-4 h-4" /> Copiar
          </button>
          <button
            type="button"
            onClick={share}
            disabled={loading || !!error}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" /> Compartilhar
          </button>
        </div>
      </div>
    </div>
  );
};
