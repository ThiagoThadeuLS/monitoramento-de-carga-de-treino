import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Loader2, Eye, SlidersHorizontal, BarChart3, Table2, Download, FileSpreadsheet } from 'lucide-react';
import { useClub } from '../../../lib/club';
import { ClubAthlete, fetchClubAthletes } from '../../../lib/athletes';
import { useDialogs } from '../../ui/Dialogs';
import { PseRecord, PsrRecord } from '../../../types';
import { addDaysISO, todayISO } from '../../../lib/date';
import { resolveSelection } from '../GroupFilter';
import { useClubGroups } from '../../../lib/groups';
import { fetchRange } from '../period/shared';
import { ExportMenu } from '../period/ExportMenu';
import { AnalysisFilterValue, analysisRangeError } from '../AnalysisFilter';
import { buildLoadRows, downloadLoadCsv, fetchPse } from '../LoadAnalysis';
import { ReportPreview, ReportState } from './ReportPreview';
import { ChartKind } from './ChartRenderer';

interface Props {
  coachName: string;
  /** Período e atletas do filtro das Análises */
  filter: AnalysisFilterValue;
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

/** Largura da "janela" usada para montar a imagem do relatório (maior que os 1100 px dele). */
const REPORT_RENDER_WIDTH = 1280;

/** Posição (em px, sem a redução da prévia na tela) de um elemento dentro de outro. */
function rangeIn(el: Element, box: DOMRect, ratio: number) {
  const r = el.getBoundingClientRect();
  return { top: (r.top - box.top) * ratio, bottom: (r.bottom - box.top) * ratio };
}

/**
 * Gera o PDF por blocos (cabeçalho, cartão do atleta, cada gráfico/tabela e o detalhamento).
 * Cada parte (cabeçalho e cada atleta) vira uma imagem só; a imagem é cortada nas bordas dos
 * blocos. Bloco que não cabe no resto da página vai inteiro para a página seguinte; só um
 * bloco maior que uma página inteira (tabela longa) é dividido, e sempre entre duas linhas
 * da tabela. Cada atleta começa numa página nova (o primeiro fica embaixo do cabeçalho, se
 * couber). As bibliotecas de PDF só são baixadas aqui, na hora de gerar.
 */
async function buildPdf(root: HTMLElement, filename: string) {
  const [{ default: JsPdf }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pdf = new JsPdf('p', 'pt', 'a4');
  const margin = 20;
  const gap = 10;
  const usableW = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  const pageH = bottom - margin;
  let y = margin;
  let empty = true;
  const newPage = () => {
    pdf.addPage();
    y = margin;
    empty = true;
  };

  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-report-page]'));
  for (const [i, section] of sections.entries()) {
    // O texto saía encavalado quando a posição medida das palavras não batia com o tamanho
    // desenhado das letras. Duas causas, tiradas na cópia que vira imagem:
    // - a prévia aparece reduzida na tela (transform: scale);
    // - no celular (Android), o Chrome aumenta sozinho o texto de blocos largos ("font
    //   boosting"). A cópia é montada com largura de computador, sem ajuste automático de
    //   texto e com max-height em tudo (o que impede o Chrome de aumentar a letra).
    const canvas = await html2canvas(section, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: REPORT_RENDER_WIDTH,
      onclone: (doc) => {
        doc.querySelectorAll<HTMLElement>('[data-report-scale]').forEach((node) => {
          node.style.transform = 'none';
          node.style.scale = 'none';
        });
        const style = doc.createElement('style');
        style.textContent =
          'html, body { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }' +
          '[data-report-root], [data-report-root] * { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; max-height: 1000000px; }';
        doc.head.appendChild(style);
      },
    });
    const pxPerPt = canvas.width / usableW;
    const box = section.getBoundingClientRect();
    const ratio = section.offsetHeight / (box.height || 1);
    const toPx = (v: number) => Math.round((v * canvas.height) / (section.offsetHeight || 1));

    // Faixas da imagem a colocar no PDF: um bloco por vez (sem as margens entre eles)
    const found = Array.from(section.querySelectorAll<HTMLElement>('[data-report-block]'));
    const blocks = section.hasAttribute('data-report-block') || found.length === 0 ? [section] : found;
    // Linhas de tabela: um bloco alto só é cortado onde nenhuma linha atravessa
    const rows = Array.from(section.querySelectorAll('tr')).map((tr) => rangeIn(tr, box, ratio));
    const safeCuts = rows
      .map((r) => r.bottom)
      .filter((cut) => !rows.some((o) => o.top < cut - 0.5 && o.bottom > cut + 0.5))
      .map(toPx)
      .sort((a, b) => a - b);

    // Atleta novo: página nova (o primeiro pode ficar embaixo do cabeçalho)
    if (i > 1 && !empty) newPage();

    for (const block of blocks) {
      const r = block === section ? { top: 0, bottom: section.offsetHeight } : rangeIn(block, box, ratio);
      const from = Math.max(0, toPx(r.top));
      const to = Math.min(canvas.height, toPx(r.bottom));
      const heightPt = (to - from) / pxPerPt;
      // Bloco que não cabe no resto da página: vai para a próxima (se ele couber numa
      // página inteira, ou se já estamos na metade de baixo da página)
      if (!empty && y + heightPt > bottom && (heightPt <= pageH || y > margin + pageH * 0.5)) newPage();

      for (let srcY = from; srcY < to; ) {
        const room = Math.floor((bottom - y) * pxPerPt);
        if (room < 40 && !empty) {
          newPage();
          continue;
        }
        let end = Math.min(to, srcY + room);
        if (end < to) {
          // Corta no fim da última linha de tabela que cabe (sem partir linha)
          const cut = safeCuts.filter((c) => c > srcY + 40 && c <= end).pop();
          if (cut) end = cut;
        }
        const slicePx = end - srcY;
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = slicePx;
        slice.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, y, usableW, slicePx / pxPerPt);
        srcY = end;
        y += slicePx / pxPerPt + gap;
        empty = false;
        if (srcY < to) newPage();
      }
    }
  }
  pdf.save(filename);
}

export const ReportBuilder: React.FC<Props> = ({ coachName, filter }) => {
  const { club } = useClub();
  const { groups } = useClubGroups();
  const { notify } = useDialogs();
  const [athletes, setAthletes] = useState<ClubAthlete[]>([]);
  const { from, to, selection, reloadKey } = filter;
  const [exportingLoad, setExportingLoad] = useState(false);
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [notesGerais, setNotesGerais] = useState('');
  const [notesLesoes, setNotesLesoes] = useState('');
  const [metrics, setMetrics] = useState(DEFAULT_METRICS);
  const previewRef = useRef<HTMLDivElement>(null);

  // Período válido e de no máximo 1 ano (igual à Análise do Período)
  const rangeError = analysisRangeError(from, to);

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([fetchClubAthletes(club?.id ?? null, reloadKey > 0), fetchRange<PseRecord>('pse_records', from, to), fetchRange<PsrRecord>('psr_records', from, to)])
      .then(([a, p, pr]) => {
        if (cancelled) return;
        setAthletes(a);
        setPse(p);
        setPsr(pr);
      })
      .catch((err) => !cancelled && setLoadError(`Não foi possível carregar os dados: ${(err as Error)?.message ?? err}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [club?.id, from, to, rangeError, reloadKey]);

  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const people = useMemo(() => athletes.filter((a) => a.active && (!selected || selected.has(a.id))), [athletes, selected]);
  const names = useMemo(() => new Map(athletes.map((a) => [a.id, a.nome])), [athletes]);
  const nameOf = (id: string) => names.get(id) ?? 'Atleta removido';

  // Planilha da carga por atleta: os 28 dias até a data final (mesma conta da aba Carga interna)
  const exportLoad = async () => {
    const ref = to <= todayISO() ? to : todayISO();
    setExportingLoad(true);
    try {
      const rows = buildLoadRows(people, await fetchPse(addDaysISO(ref, -55), ref), ref);
      downloadLoadCsv(rows, ref);
    } catch (err) {
      notify(`Não foi possível exportar a carga: ${(err as Error)?.message ?? err}`, 'error');
    } finally {
      setExportingLoad(false);
    }
  };

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
      const filename = `relatorio-${(club?.nome || 'clube').replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${to}.pdf`;
      await buildPdf(previewRef.current, filename);
    } catch (err) {
      notify(`Não foi possível gerar o PDF: ${(err as Error)?.message ?? err}`, 'error');
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
              disabled={loading || !!rangeError || !!loadError || people.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar preview
            </button>
          </div>

          {/* Planilhas: o período e os atletas do filtro das Análises */}
          <div data-tour="report-export" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 lg:mr-auto">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Planilhas para Excel</p>
                <p className="text-xs text-slate-400">Período e atletas do filtro acima.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportMenu
                inline
                from={from}
                to={to}
                pse={pse}
                psr={psr}
                selected={selected}
                nameOf={nameOf}
                disabled={loading || !!rangeError || !!loadError}
                onError={(m) => notify(m, 'error')}
              />
              <button
                type="button"
                onClick={exportLoad}
                disabled={exportingLoad || loading || people.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
              >
                {exportingLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Carga por atleta (ACWR)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 lg:gap-5">
            <div className="space-y-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">Montagem do relatório</h3>
                </header>
                <div className="p-4 space-y-4">
                  <p className="text-xs text-slate-400">
                    {people.length} atleta{people.length === 1 ? '' : 's'} • {periodLabel}
                  </p>
                  {(rangeError || loadError) && (
                    <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{rangeError || loadError}</p>
                  )}
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
            <div className="w-full py-4 px-2">
              <ScaledPreview>
                <ReportPreview ref={previewRef} club={club} coachName={coachName} periodLabel={periodLabel} state={state} athletesData={athletesData} />
              </ScaledPreview>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PREVIEW_WIDTH = 1100;

/**
 * Prévia do relatório reduzida para caber na largura da tela (celular, tablet ou computador),
 * sem cortar as laterais. A altura acompanha a redução (não sobra espaço em branco embaixo).
 */
const ScaledPreview: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      setScale(Math.min(1, outer.clientWidth / PREVIEW_WIDTH));
      setHeight(inner.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full">
      <div className="mx-auto overflow-hidden" style={{ width: PREVIEW_WIDTH * scale, height: height * scale }}>
        <div ref={innerRef} data-report-scale style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
