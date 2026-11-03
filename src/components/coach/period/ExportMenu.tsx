import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PseRecord, PsrRecord, WeightRecord } from '../../../types';
import { brDate, downloadCsv, fileSlug, localTime, toCsv } from '../../../lib/export';
import { sessionLoad } from '../../../lib/load';
import { fetchRange } from './shared';

interface Props {
  from: string;
  to: string;
  pse: PseRecord[];
  psr: PsrRecord[];
  /** null = todos os atletas */
  selected: Set<string> | null;
  nameOf: (athleteId: string) => string;
  disabled: boolean;
  onError: (message: string) => void;
}

/** Exportar planilhas (CSV para Excel): respeita o período e a seleção de atletas. */
export const ExportMenu: React.FC<Props> = ({ from, to, pse, psr, selected, nameOf, disabled, onError }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sortRows = <T extends { athlete_id: string; date: string; created_at?: string }>(rows: T[]) =>
    rows
      .filter((r) => !selected || selected.has(r.athlete_id))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          nameOf(a.athlete_id).localeCompare(nameOf(b.athlete_id), 'pt-BR') ||
          (a.created_at ?? '').localeCompare(b.created_at ?? '')
      );

  const exportData = async (kind: 'pse' | 'psr' | 'peso') => {
    setOpen(false);
    if (kind === 'pse') {
      downloadCsv(
        fileSlug('pse', from, 'a', to),
        toCsv(sortRows(pse), [
          { label: 'Data', value: (r) => brDate(r.date) },
          { label: 'Hora do envio', value: (r) => localTime(r.created_at) },
          { label: 'Atleta', value: (r) => nameOf(r.athlete_id) },
          { label: 'Tipo de treino', value: (r) => r.training_type },
          { label: 'PSE', value: (r) => r.rpe_score },
          { label: 'Duração (min)', value: (r) => r.duration_minutes },
          { label: 'Carga (UA)', value: (r) => sessionLoad(r) },
          { label: 'Não treinou', value: (r) => r.did_not_train },
          { label: 'Observações / motivo', value: (r) => r.observations },
        ])
      );
    } else if (kind === 'psr') {
      downloadCsv(
        fileSlug('psr', from, 'a', to),
        toCsv(sortRows(psr), [
          { label: 'Data', value: (r) => brDate(r.date) },
          { label: 'Hora do envio', value: (r) => localTime(r.created_at) },
          { label: 'Atleta', value: (r) => nameOf(r.athlete_id) },
          { label: 'PSR (recuperação)', value: (r) => r.psr_score },
          { label: 'Fadiga', value: (r) => r.fatigue_score },
          { label: 'Sono', value: (r) => r.sleep_score },
          { label: 'Dor muscular', value: (r) => r.muscle_soreness_score },
          { label: 'Estresse', value: (r) => r.stress_score },
          { label: 'Humor', value: (r) => r.mood_score },
        ])
      );
    } else {
      setExporting(true);
      try {
        const rows = await fetchRange<WeightRecord>('weight_records', from, to);
        downloadCsv(
          fileSlug('peso', from, 'a', to),
          toCsv(sortRows(rows), [
            { label: 'Data', value: (r) => brDate(r.date) },
            { label: 'Hora do envio', value: (r) => localTime(r.created_at) },
            { label: 'Atleta', value: (r) => nameOf(r.athlete_id) },
            { label: 'Peso (kg)', value: (r) => Number(r.weight) },
          ])
        );
      } catch (err: any) {
        onError(`Não foi possível exportar o peso: ${err.message ?? err}`);
      } finally {
        setExporting(false);
      }
    }
  };

  return (
    <div className="relative flex-1 lg:flex-none">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled || exporting}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors disabled:opacity-50"
      >
        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span>Exportar</span>
      </button>
      {open && (
        <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-1.5 z-20 w-56 max-w-[calc(100vw-3rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5">
          <p className="px-2.5 py-1.5 text-[10px] uppercase font-bold text-slate-500">Planilha (CSV para Excel)</p>
          {(
            [
              ['pse', 'PSE e carga'],
              ['psr', 'PSR (bem-estar)'],
              ['peso', 'Peso'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => exportData(k)} className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800">
              {l}
            </button>
          ))}
          <p className="px-2.5 pt-1.5 text-[10px] text-slate-500">Período e atletas escolhidos no filtro.</p>
        </div>
      )}
    </div>
  );
};
