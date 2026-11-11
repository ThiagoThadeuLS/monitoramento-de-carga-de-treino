import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, LineChart, Minus, TrendingUp } from 'lucide-react';
import { AthletePr } from '../../lib/athleteAuth';
import { buildPrProgress } from '../../lib/prProgress';
import { TrendLine } from '../ui/TrendLine';

const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmtKg(v)}`;

interface AthletePrProgressProps {
  prs: AthletePr[];
  /** Exercício para abrir já selecionado (ex.: o PR que acabou de subir) */
  initial?: string;
}

/** Acompanhamento do PR: gráfico da carga ao longo do tempo e cada mudança registrada. */
export function AthletePrProgress({ prs, initial }: AthletePrProgressProps) {
  const [chosen, setChosen] = useState<string | null>(null);

  // Padrão: o exercício pedido, senão o PR atualizado por último
  const fallback = useMemo(() => {
    const byInitial = initial && prs.find((p) => p.exercicio.toLowerCase() === initial.toLowerCase());
    if (byInitial) return byInitial.exercicio;
    return [...prs].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]?.exercicio ?? '';
  }, [prs, initial]);
  const selected = prs.find((p) => p.exercicio === chosen) ?? prs.find((p) => p.exercicio === fallback);

  const progress = useMemo(
    () => (selected ? buildPrProgress(selected.history ?? [], selected.peso_pr, selected.updated_at) : null),
    [selected]
  );

  if (!selected || !progress) return null;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <LineChart className="w-4 h-4 text-sky-400" /> Meu progresso
        </h3>
        <p className="text-xs text-slate-400">Como a sua carga máxima mudou desde o primeiro registro.</p>
      </div>

      {/* Escolha do exercício */}
      {prs.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Exercício">
          {prs.map((p) => {
            const on = p.exercicio === selected.exercicio;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setChosen(p.exercicio)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap flex-shrink-0 transition-colors ${
                  on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.exercicio}
              </button>
            );
          })}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] uppercase font-bold text-slate-500">PR atual</p>
          <p className="text-lg font-black text-emerald-300">{fmtKg(progress.current)} kg</p>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] uppercase font-bold text-slate-500">Desde o início</p>
          <p className={`text-lg font-black ${progress.gainKg > 0 ? 'text-emerald-300' : progress.gainKg < 0 ? 'text-amber-300' : 'text-slate-300'}`}>
            {signed(progress.gainKg)} kg
          </p>
          {progress.gainPct !== null && progress.gainKg !== 0 && (
            <p className="text-[11px] text-slate-400">{signed(progress.gainPct)}%</p>
          )}
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] uppercase font-bold text-slate-500">Vezes que subiu</p>
          <p className="text-lg font-black text-white">{progress.improvements}</p>
          {progress.first && <p className="text-[11px] text-slate-400">desde {brDay(progress.first.date)}</p>}
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] uppercase font-bold text-slate-500">Último aumento</p>
          <p className="text-sm font-bold text-white mt-1">{progress.lastImprovement ? brDay(progress.lastImprovement) : '—'}</p>
        </div>
      </div>

      {/* Gráfico */}
      {progress.points.length > 1 ? (
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
          <TrendLine
            points={progress.points.map((p) => ({ date: p.date, value: p.peso }))}
            format={(v) => `${fmtKg(v)} kg`}
            tickFormat={(v) => fmtKg(Math.round(v))}
            minPad={2}
            ariaLabel={`Evolução do PR de ${selected.exercicio}`}
            color="#34d399"
            height={180}
          />
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-dashed border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-600 flex-shrink-0" />
          Primeiro registro salvo. Quando você atualizar este PR, o gráfico mostra a evolução.
        </div>
      )}

      {/* Cada mudança */}
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Registros</p>
        <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 max-h-60 overflow-y-auto">
          {progress.steps.map((s, i) => (
            <li key={`${s.date}-${i}`} className="flex items-center gap-3 px-3 py-2 text-xs">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="text-slate-400 w-20 flex-shrink-0">{brDay(s.date)}</span>
              <span className="font-bold text-white flex-1">{fmtKg(s.peso)} kg</span>
              {s.diff === null ? (
                <span className="text-[11px] text-slate-500">primeiro registro</span>
              ) : s.diff > 0 ? (
                <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5" /> {signed(s.diff)} kg
                </span>
              ) : s.diff < 0 ? (
                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-0.5">
                  <ArrowDownRight className="w-3.5 h-3.5" /> {signed(s.diff)} kg
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                  <Minus className="w-3.5 h-3.5" /> igual
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
