import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useClub } from '../../lib/club';
import { fetchClubAthletes } from '../../lib/athletes';
import { PseRecord, PsrRecord } from '../../types';
import { addDaysISO, todayISO } from '../../lib/date';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection } from './GroupFilter';
import { useClubGroups } from '../../lib/groups';
import { fetchRange } from './period/shared';
import { sessionLoad } from '../../lib/load';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Props {
  coachName: string;
}



export const ReportExport: React.FC<Props> = ({ coachName }) => {
  const { club } = useClub();
  const { groups } = useClubGroups();
  const [athletes, setAthletes] = useState<Array<{ id: string; nome: string; active: boolean; categoria?: string | null; classe?: string | null }>>([]);
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  const [from, setFrom] = useState(addDaysISO(todayISO(), -14));
  const [to, setTo] = useState(todayISO());
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const includePse = true;
  const includePsr = true;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchClubAthletes(club?.id ?? null), fetchRange<PseRecord>('pse_records', from, to), fetchRange<PsrRecord>('psr_records', from, to)])
      .then(([a, p, pr]) => {
        if (cancelled) return;
        setAthletes(a as any);
        setPse(p);
        setPsr(pr);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? 'Erro ao carregar dados');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [club?.id, from, to]);

  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const people = useMemo(() => athletes.filter((a) => a.active && (!selected || selected.has(a.id))), [athletes, selected]);

  const generate = async () => {
    if (generating) return;
    setError('');
    setOk('');
    if (people.length === 0) {
      setError('Selecione pelo menos um atleta');
      return;
    }
    setGenerating(true);
    try {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '1100px';
      container.style.background = '#ffffff';
      document.body.appendChild(container);

      const periodLabel = `${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}`;

      const pages = [];
      for (const athlete of people) {
        const p = pse.filter((r) => r.athlete_id === athlete.id).sort((a, b) => a.date.localeCompare(b.date));
        const pr = psr.filter((r) => r.athlete_id === athlete.id).sort((a, b) => a.date.localeCompare(b.date));
        const div = document.createElement('div');
        div.style.width = '1100px';
        div.style.padding = '40px';
        div.style.fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        div.style.color = '#0f172a';
        div.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="display:flex;align-items:center;gap:16px">
              ${club?.escudo_url ? `<img src="${club.escudo_url}" style="height:64px;width:auto" />` : `<div style="height:64px;width:64px;border-radius:12px;background:#0ea5e9;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:20px">${(club?.nome||'CL').slice(0,3).toUpperCase()}</div>`}
              <div>
                <div style="font-size:18px;font-weight:800">${club?.nome || 'Clube'}</div>
                <div style="font-size:12px;color:#475569">Relatório de Carga e Bem-Estar</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:#475569">Exportado por</div>
              <div style="font-size:14px;font-weight:700">${coachName}</div>
              <div style="font-size:12px;color:#475569;margin-top:4px">${periodLabel}</div>
            </div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:16px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between">
            <div>
              <div style="font-size:12px;color:#475569">Atleta</div>
              <div style="font-size:20px;font-weight:800">${athlete.nome}</div>
              ${(athlete.categoria||athlete.classe)?`<div style="font-size:12px;color:#475569">${[athlete.categoria,athlete.classe].filter(Boolean).join(' • ')}</div>`:''}
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:#475569">Período analisado</div>
              <div style="font-size:14px;font-weight:700">Mínimo 14 dias | ${p.length} registros PSE | ${pr.length} registros PSR</div>
            </div>
          </div>
          ${includePse && p.length>0 ? `
          <div style="margin-bottom:18px">
            <div style="font-size:16px;font-weight:800;margin-bottom:10px">PSE, Tipo de treino e Carga (UA)</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="text-align:left;padding:8px;border:1px solid #e2e8f0">Data</th>
                  <th style="text-align:left;padding:8px;border:1px solid #e2e8f0">Tipo</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">PSE</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Duração (min)</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Carga (UA)</th>
                  <th style="text-align:left;padding:8px;border:1px solid #e2e8f0">Obs</th>
                </tr>
              </thead>
              <tbody>
                ${p.map(r=>`<tr><td style="padding:7px 8px;border:1px solid #e2e8f0">${r.date.split('-').reverse().join('/')}</td><td style="padding:7px 8px;border:1px solid #e2e8f0">${r.training_type||'-'}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.did_not_train?'—':r.rpe_score??'-'}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.did_not_train?'—':r.duration_minutes??'-'}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.did_not_train?'—':(sessionLoad(r)??'-')}</td><td style="padding:7px 8px;border:1px solid #e2e8f0">${r.observations||''}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
          ${includePsr && pr.length>0 ? `
          <div>
            <div style="font-size:16px;font-weight:800;margin-bottom:10px">PSR - Bem-estar (1-10)</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="text-align:left;padding:8px;border:1px solid #e2e8f0">Data</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Recuperação</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Fadiga</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Sono</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Dor muscular</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Estresse</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">Humor</th>
                  <th style="text-align:center;padding:8px;border:1px solid #e2e8f0">PSR</th>
                </tr>
              </thead>
              <tbody>
                ${pr.map(r=>`<tr><td style="padding:7px 8px;border:1px solid #e2e8f0">${r.date.split('-').reverse().join('/')}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.psr_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.fatigue_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.sleep_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.muscle_soreness_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.stress_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0">${r.mood_score}</td><td style="text-align:center;padding:7px 8px;border:1px solid #e2e8f0;font-weight:700">${r.psr_score}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
        `;
        container.appendChild(div);
        pages.push(div);
      }

      const pdf = new jsPDF('p', 'pt', 'a4');
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 40;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, 20, imgWidth, Math.min(imgHeight, pageHeight - 40));
      }

      const filename = `relatorio-${club?.nome?.replace(/[^a-z0-9]/gi,'_').toLowerCase()||'clube'}-${to}.pdf`;
      pdf.save(filename);
      document.body.removeChild(container);
      setOk('PDF gerado com sucesso');
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao gerar PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 text-sky-400">
          <FileDown className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Relatório em PDF</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">De</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até</span>
            <input type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
          </label>
          <div className="lg:col-span-2">
            <GroupFilter groups={groups} athletes={athletes.filter((a) => a.active)} value={selection} onChange={setSelection} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Período mínimo recomendado: 14 dias. Atualmente: {people.length} atleta(s) selecionado(s).</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={generate} disabled={generating || loading || people.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Gerar PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}
      {ok && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-2.5 text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> <span>{ok}</span>
        </div>
      )}
    </div>
  );
};
