import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Loader2, Eye, SlidersHorizontal, BarChart3, Table2 } from 'lucide-react';
import { useClub } from '../../../lib/club';
import { fetchClubAthletes } from '../../../lib/athletes';
import { PseRecord, PsrRecord } from '../../../types';
import { addDaysISO, todayISO } from '../../../lib/date';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection } from '../GroupFilter';
import { useClubGroups } from '../../../lib/groups';
import { fetchRange } from '../period/shared';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ReportPreview, ReportState } from './ReportPreview';
import { ChartKind } from './ChartRenderer';

interface Props {
  coachName: string;
}

const DEFAULT_METRICS = [
  { id: 'pse_medio', label: 'Média de PSE por dia', enabled: true, view: 'chart' as const, chartKind: 'line' as ChartKind },
  { id: 'carga_ua', label: 'Carga (PSE x minutos) por dia', enabled: true, view: 'chart' as const, chartKind: 'bar' as ChartKind },
  { id: 'psr_medio', label: 'PSR Médio por dia', enabled: true, view: 'chart' as const, chartKind: 'line' as ChartKind },
  { id: 'fadiga', label: 'Fadiga por dia', enabled: false, view: 'table' as const, chartKind: 'line' as ChartKind },
  { id: 'sono', label: 'Sono por dia', enabled: false, view: 'table' as const, chartKind: 'area' as ChartKind },
  { id: 'dor_muscular', label: 'Dor Muscular por dia', enabled: false, view: 'table' as const, chartKind: 'line' as ChartKind },
  { id: 'estresse', label: 'Estresse por dia', enabled: false, view: 'table' as const, chartKind: 'line' as ChartKind },
  { id: 'humor', label: 'Humor por dia', enabled: false, view: 'table' as const, chartKind: 'radar' as ChartKind },
];

export const ReportBuilder: React.FC<Props> = ({ coachName }) => {
  const { club } = useClub();
  const { groups } = useClubGroups();
  const [athletes, setAthletes] = useState<Array<any>>([]);
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  const [from, setFrom] = useState(addDaysISO(todayISO(), -14));
  const [to, setTo] = useState(todayISO());
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notesGerais, setNotesGerais] = useState('');
  const [notesLesoes, setNotesLesoes] = useState('');
  const [metrics, setMetrics] = useState(DEFAULT_METRICS);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchClubAthletes(club?.id ?? null), fetchRange<PseRecord>('pse_records', from, to), fetchRange<PsrRecord>('psr_records', from, to)])
      .then(([a, p, pr]) => {
        if (cancelled) return;
        setAthletes(a);
        setPse(p);
        setPsr(pr);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [club?.id, from, to]);

  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const people = useMemo(() => athletes.filter((a) => a.active && (!selected || selected.has(a.id))), [athletes, selected]);

  const athletesData = useMemo(
    () =>
      people.map((athlete) => ({
        athlete,
        pse: pse.filter((r) => r.athlete_id === athlete.id),
        psr: psr.filter((r) => r.athlete_id === athlete.id),
      })),
    [people, pse, psr]
  );

  const periodLabel = `${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}`;
  const state: ReportState = { from, to, notesGerais, notesLesoes, metrics };

  const toggleMetric = (id: string, key: 'enabled' | 'view' | 'chartKind', value: any) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  };

  const download = async () => {
    if (!previewRef.current || generating) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 20;
      pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 40;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 20;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 40;
      }
      const filename = `relatorio-${(club?.nome || 'clube').replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${to}.pdf`;
      pdf.save(filename);
    } finally {
      setGenerating(false);
    }
  };

  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-5">
      {!showPreview ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Relatório em PDF</h2>
              <p className="text-xs text-slate-400">Monte o relatório com anotações, métricas, tabelas e gráficos</p>
            </div>
            <button
              onClick={() => setShowPreview(true)}
              disabled={loading || people.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar preview
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 lg:gap-5">
            <div className="space-y-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">Montagem do relatório</h3>
                </header>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">De</span>
                      <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até</span>
                      <input type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs" />
                    </label>
                  </div>
                  <GroupFilter groups={groups} athletes={athletes.filter((a) => a.active)} value={selection} onChange={setSelection} />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Anotações gerais</span>
                    <textarea value={notesGerais} onChange={(e) => setNotesGerais(e.target.value)} rows={4} placeholder="Objetivo, observações gerais, feedback..." className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs resize-none" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Anotações sobre lesões</span>
                    <textarea value={notesLesoes} onChange={(e) => setNotesLesoes(e.target.value)} rows={4} placeholder="Lesões, restrições, cuidados..." className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs resize-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">Métricas, tabela ou gráfico</h3>
              </header>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {metrics.map((m) => (
                  <div key={m.id} className="border border-slate-800 rounded-xl p-3 space-y-2">
                    <label className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={m.enabled} onChange={(e) => toggleMetric(m.id, 'enabled', e.target.checked)} className="accent-sky-500" />
                        <span className="text-xs font-semibold text-white">{m.label}</span>
                      </div>
                    </label>
                    {m.enabled && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => toggleMetric(m.id, 'view', 'table')} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${m.view === 'table' ? 'bg-slate-100 text-slate-950 border-slate-100' : 'border-slate-700 text-slate-400'}`}>
                          <Table2 className="w-3 h-3" /> Tabela
                        </button>
                        <button onClick={() => toggleMetric(m.id, 'view', 'chart')} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${m.view === 'chart' ? 'bg-slate-100 text-slate-950 border-slate-100' : 'border-slate-700 text-slate-400'}`}>
                          <BarChart3 className="w-3 h-3" /> Gráfico
                        </button>
                        {m.view === 'chart' && (
                          <select value={m.chartKind} onChange={(e) => toggleMetric(m.id, 'chartKind', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white">
                            <option value="line">Linha</option>
                            <option value="bar">Barras</option>
                            <option value="area">Área</option>
                            <option value="radar">Radar</option>
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
              >
                Voltar para edição
              </button>
              <div>
                <h2 className="text-lg font-bold text-white">Preview do relatório</h2>
                <p className="text-xs text-slate-400">{people.length} atleta(s) | {periodLabel}</p>
              </div>
            </div>
            <button
              onClick={download}
              disabled={generating || people.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Baixar PDF
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-auto">
            <div className="w-full flex justify-center py-4">
              <div className="origin-top scale-[0.6] sm:scale-[0.7] md:scale-[0.8] lg:scale-[0.9] xl:scale-100">
                <ReportPreview ref={previewRef} club={club} coachName={coachName} periodLabel={periodLabel} state={state} athletesData={athletesData} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
