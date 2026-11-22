import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Check, LineChart, Loader2, Minus, Pencil, Trash2, TrendingUp, X } from 'lucide-react';
import { AthletePr } from '../../lib/athleteAuth';
import { buildPrProgress, PrStep } from '../../lib/prProgress';
import { todayISO } from '../../lib/date';
import { TrendLine } from '../ui/TrendLine';

const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmtKg(v)}`;

interface AthletePrProgressProps {
  prs: AthletePr[];
  /** Exercício aberto (escolhido na lista de cima ou o PR que acabou de subir) */
  selected?: string;
  onSelect?: (exercicio: string) => void;
  /** Corrigir um registro (carga e dia). Sem isso a lista é só leitura. */
  onUpdate?: (id: string, peso: number, data: string) => Promise<void>;
  /** Apagar um registro (o PR atual passa a ser o anterior). */
  onDelete?: (step: PrStep, exercicio: string) => Promise<void>;
}

/** Acompanhamento do PR: gráfico da carga ao longo do tempo e cada registro, com correção. */
export function AthletePrProgress({ prs, selected: selectedName, onSelect, onUpdate, onDelete }: AthletePrProgressProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; peso: string; data: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Padrão: o exercício pedido, senão o PR atualizado por último
  const fallback = useMemo(() => {
    const byName = selectedName && prs.find((p) => p.exercicio.toLowerCase() === selectedName.toLowerCase());
    if (byName) return byName.exercicio;
    return [...prs].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]?.exercicio ?? '';
  }, [prs, selectedName]);
  const current = onSelect ? fallback : chosen ?? fallback;
  const selected = prs.find((p) => p.exercicio === current) ?? prs.find((p) => p.exercicio === fallback);

  const progress = useMemo(
    () => (selected ? buildPrProgress(selected.history ?? [], selected.peso_pr, selected.updated_at) : null),
    [selected]
  );

  if (!selected || !progress) return null;

  const choose = (name: string) => {
    setEditing(null);
    if (onSelect) onSelect(name);
    else setChosen(name);
  };

  const saveEdit = async () => {
    if (!editing || !onUpdate) return;
    setBusy(editing.id);
    try {
      await onUpdate(editing.id, Number(editing.peso.replace(',', '.')), editing.data);
      setEditing(null);
    } catch {
      // a mensagem já apareceu (quem chama avisa)
    } finally {
      setBusy(null);
    }
  };

  const remove = async (s: PrStep) => {
    if (!onDelete || !s.id) return;
    setBusy(s.id);
    try {
      await onDelete(s, selected.exercicio);
    } finally {
      setBusy(null);
    }
  };

  const editable = !!onUpdate || !!onDelete;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <LineChart className="w-4 h-4 text-sky-400" /> Meu progresso
        </h3>
        <p className="text-xs text-slate-400">
          Como a sua carga máxima mudou desde o primeiro registro.{editable && ' Lançou errado? Corrija ou apague o registro na lista.'}
        </p>
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
                onClick={() => choose(p.exercicio)}
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
          {progress.best > progress.current && <p className="text-[11px] text-slate-400">melhor: {fmtKg(progress.best)} kg</p>}
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
          Primeiro registro salvo. Quando você lançar um novo PR, o gráfico mostra a evolução.
        </div>
      )}

      {/* Cada registro */}
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Registros ({progress.steps.length})</p>
        <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
          {progress.steps.map((s, i) =>
            editing && s.id === editing.id ? (
              <li key={s.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-xs bg-slate-950/60">
                <input
                  type="date"
                  value={editing.data}
                  max={todayISO()}
                  onChange={(e) => setEditing({ ...editing, data: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  aria-label="Dia do registro"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0.5"
                    max="500"
                    value={editing.peso}
                    onChange={(e) => setEditing({ ...editing, peso: e.target.value })}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    aria-label="Carga em kg"
                  />
                  <span className="text-slate-500">kg</span>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={busy === s.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salvar
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white" aria-label="Cancelar">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ) : (
              <li key={s.id ?? `${s.date}-${i}`} className="flex items-center gap-3 px-3 py-2 text-xs">
                <CalendarDays className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="text-slate-400 w-20 flex-shrink-0">{brDay(s.date)}</span>
                <span className="font-bold text-white flex-1 whitespace-nowrap">
                  {fmtKg(s.peso)} kg
                  {i === 0 && <span className="ml-1.5 text-[10px] font-bold text-emerald-300">atual</span>}
                </span>
                {s.diff === null ? (
                  <span className="text-[11px] text-slate-500">primeiro</span>
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
                {editable && s.id && (
                  <div className="flex items-center flex-shrink-0 -mr-1">
                    {onUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditing({ id: s.id!, peso: String(s.peso), data: s.date })}
                        className="p-1.5 text-slate-500 hover:text-sky-300"
                        title="Corrigir registro"
                        aria-label={`Corrigir registro de ${brDay(s.date)}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={busy === s.id}
                        className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                        title="Apagar registro"
                        aria-label={`Apagar registro de ${brDay(s.date)}`}
                      >
                        {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      </div>
    </section>
  );
}
