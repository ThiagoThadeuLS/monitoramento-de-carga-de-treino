import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarRange, RefreshCw } from 'lucide-react';
import { addDaysISO, todayISO } from '../../lib/date';
import { useClub } from '../../lib/club';
import { useClubGroups } from '../../lib/groups';
import { ClubAthlete, fetchClubAthletes } from '../../lib/athletes';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter } from './GroupFilter';
import { MAX_DAYS, PRESETS } from './period/shared';

/** Filtro das Análises: o mesmo período e os mesmos atletas valem para Período, Carga interna e Relatório. */
export interface AnalysisFilterValue {
  from: string;
  to: string;
  selection: AthleteSelection;
  /** Muda a cada "Atualizar" (as telas buscam os dados de novo) */
  reloadKey: number;
}

export const initialAnalysisFilter = (): AnalysisFilterValue => ({
  from: addDaysISO(todayISO(), -13),
  to: todayISO(),
  selection: EMPTY_SELECTION,
  reloadKey: 0,
});

/** Período inválido (vazio, invertido ou maior que 1 ano): mensagem; válido: ''. */
export function analysisRangeError(from: string, to: string): string {
  if (!from || !to) return 'Preencha as duas datas.';
  if (from > to) return 'A data "De" precisa ser anterior à data "Até".';
  if (addDaysISO(from, MAX_DAYS - 1) < to) return 'Escolha um período de no máximo 1 ano.';
  return '';
}

interface Props {
  value: AnalysisFilterValue;
  onChange: (value: AnalysisFilterValue) => void;
  /** Aba aberta: a Carga interna usa só a data final (28 dias até ela) */
  section: string;
}

const dateCls =
  'w-full lg:w-auto bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer';

export const AnalysisFilter: React.FC<Props> = ({ value, onChange, section }) => {
  const { club } = useClub();
  const { groups } = useClubGroups();
  const [athletes, setAthletes] = useState<ClubAthlete[]>([]);
  const { from, to } = value;
  const rangeError = analysisRangeError(from, to);
  const onlyEnd = section === 'carga';

  useEffect(() => {
    let cancelled = false;
    fetchClubAthletes(club?.id ?? null)
      .then((rows) => !cancelled && setAthletes(rows.filter((a) => a.active)))
      .catch(() => !cancelled && setAthletes([]));
    return () => {
      cancelled = true;
    };
  }, [club?.id, value.reloadKey]);

  const set = (patch: Partial<AnalysisFilterValue>) => onChange({ ...value, ...patch });
  const applyPreset = (n: number) => {
    const today = todayISO();
    set({ to: today, from: addDaysISO(today, -(n - 1)) });
  };
  const activePreset = PRESETS.find((p) => to === todayISO() && from === addDaysISO(to, -(p.days - 1)));

  return (
    <div data-tour="analysis-filters" className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex items-center gap-2 text-sky-400 lg:pb-2.5">
          <CalendarRange className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Período</span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-3">
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">De</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} disabled={onlyEnd} className={`${dateCls} disabled:opacity-40`} />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até</span>
            <input type="date" value={to} min={from || undefined} max={todayISO()} onChange={(e) => set({ to: e.target.value })} className={dateCls} />
          </label>
        </div>

        <div className="flex items-center gap-2 lg:pb-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => applyPreset(p.days)}
              className={`flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                activePreset?.days === p.days ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <GroupFilter groups={groups} athletes={athletes} value={value.selection} onChange={(selection) => set({ selection })} className="lg:w-64" />

        <button
          type="button"
          onClick={() => set({ reloadKey: value.reloadKey + 1 })}
          title="Buscar os dados mais recentes"
          aria-label="Atualizar dados"
          className="lg:ml-auto self-start lg:self-end p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {onlyEnd && <p className="text-[11px] text-slate-500">Carga interna: calcula os 28 dias até a data “Até”.</p>}
      {rangeError && !onlyEnd && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{rangeError}</span>
        </div>
      )}
    </div>
  );
};
