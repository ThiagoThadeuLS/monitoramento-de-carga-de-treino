import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarDays, Loader2, Minus, Pencil, Plus, Timer, Trash2, X } from 'lucide-react';
import { deleteAthleteTest, listAthleteTests, saveAthleteTest } from '../../lib/athleteAuth';
import {
  PHYSICAL_TESTS,
  PhysicalTestEntry,
  PhysicalTestKind,
  estimateVo2,
  formatTest,
  formatTestDiff,
  summarizeTests,
  testDef,
  testScore,
  validateTest,
} from '../../lib/physicalTests';
import { todayISO } from '../../lib/date';
import { brDate } from '../../lib/export';
import { useDialogs } from '../ui/Dialogs';
import { TrendLine } from '../ui/TrendLine';

interface Draft {
  id: string | null;
  teste: PhysicalTestKind;
  data: string;
  valor: string;
  estagio: string;
}

const emptyDraft = (teste: PhysicalTestKind): Draft => ({ id: null, teste, data: todayISO(), valor: '', estagio: '' });
const num = (s: string) => Number(s.replace(',', '.'));
const fmt1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Aba PRs → Testes físicos: barra (repetições e isometria), beep test e CMJ. */
export function AthleteTests({ token }: { token: string }) {
  const { confirm, notify } = useDialogs();
  const [entries, setEntries] = useState<PhysicalTestEntry[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PhysicalTestKind>('barra_reps');
  const [draft, setDraft] = useState<Draft>(emptyDraft('barra_reps'));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await listAthleteTests(token));
      setError('');
    } catch (err) {
      setError((err as Error).message);
      setEntries((e) => e ?? []);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarizeTests(entries ?? []), [entries]);
  const current = summary.get(selected);
  const def = testDef(selected)!;

  const pick = (kind: PhysicalTestKind) => {
    setSelected(kind);
    if (!draft.id) setDraft((d) => ({ ...d, teste: kind, valor: '', estagio: '' }));
  };

  const startEdit = (e: PhysicalTestEntry) => {
    setSelected(e.teste);
    setDraft({ id: e.id, teste: e.teste, data: e.data, valor: String(e.valor), estagio: e.estagio ? String(e.estagio) : '' });
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const valor = num(draft.valor);
    const estagio = draft.teste === 'beep' && draft.estagio.trim() ? num(draft.estagio) : null;
    const problem = validateTest(draft.teste, valor, estagio);
    if (problem) {
      notify(problem, 'error');
      return;
    }
    if (!draft.data || draft.data > todayISO()) {
      notify('Escolha um dia até hoje.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveAthleteTest(token, { id: draft.id, teste: draft.teste, data: draft.data, valor, estagio });
      notify(draft.id ? 'Teste corrigido.' : 'Teste registrado.', 'success');
      setDraft(emptyDraft(draft.teste));
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: PhysicalTestEntry) => {
    const ok = await confirm({
      message: `Apagar o registro de ${testDef(e.teste)?.curto}: ${formatTest(e)} (${brDate(e.data)})?`,
      danger: true,
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await deleteAthleteTest(token, e.id);
      if (draft.id === e.id) setDraft(emptyDraft(e.teste));
      notify('Registro apagado.', 'success');
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const beepVo2 =
    draft.teste === 'beep' && Number.isInteger(num(draft.valor)) && num(draft.valor) >= 1
      ? estimateVo2(num(draft.valor), draft.estagio.trim() ? num(draft.estagio) : 0)
      : null;

  if (entries === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl border bg-red-950/60 border-red-600 text-red-300 flex items-center gap-2.5 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Último resultado de cada teste (tocar escolhe) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {PHYSICAL_TESTS.map((t) => {
          const s = summary.get(t.id);
          const on = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-pressed={on}
              className={`text-left rounded-2xl border p-3 transition-colors ${
                on ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
              }`}
            >
              <p className="text-[10px] uppercase font-bold text-slate-400">{t.curto}</p>
              <p className="text-lg font-black text-white leading-tight">{s ? formatTest(s.latest) : '—'}</p>
              <p className="text-[11px] text-slate-500">
                {s ? (
                  <>
                    {brDate(s.latest.data).slice(0, 5)}
                    {s.diff !== null && s.diff !== 0 && (
                      <span className={s.diff > 0 ? 'text-emerald-300' : 'text-amber-300'}> • {formatTestDiff(t.id, s.diff)}</span>
                    )}
                  </>
                ) : (
                  'sem registro'
                )}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Registrar / corrigir */}
        <form onSubmit={save} className="md:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            {draft.id ? <Pencil className="w-4 h-4 text-sky-400" /> : <Plus className="w-4 h-4 text-emerald-400" />}
            {draft.id ? 'Corrigir registro' : 'Novo teste'}
            {draft.id && (
              <button type="button" onClick={() => setDraft(emptyDraft(selected))} className="ml-auto text-[11px] text-slate-400 hover:text-white flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            )}
          </h3>

          <label className="block">
            <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Teste</span>
            <select
              value={draft.teste}
              onChange={(e) => {
                const kind = e.target.value as PhysicalTestKind;
                setSelected(kind);
                setDraft((d) => ({ ...d, teste: kind, estagio: kind === 'beep' ? d.estagio : '' }));
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {PHYSICAL_TESTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 mt-1 block">{testDef(draft.teste)?.descricao}</span>
          </label>

          <div className={draft.teste === 'beep' ? 'grid grid-cols-2 gap-2' : ''}>
            <label className="block">
              <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                {draft.teste === 'beep' ? 'Nível' : `Resultado (${testDef(draft.teste)?.unidade})`}
              </span>
              <input
                type="number"
                inputMode={testDef(draft.teste)?.inteiro ? 'numeric' : 'decimal'}
                step={testDef(draft.teste)?.inteiro ? 1 : 0.1}
                min={testDef(draft.teste)?.min}
                max={testDef(draft.teste)?.max}
                value={draft.valor}
                onChange={(e) => setDraft({ ...draft, valor: e.target.value })}
                placeholder={draft.teste === 'beep' ? 'Ex.: 10' : draft.teste === 'cmj' ? 'Ex.: 42,5' : draft.teste === 'barra_iso' ? 'Ex.: 45' : 'Ex.: 12'}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </label>
            {draft.teste === 'beep' && (
              <label className="block">
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Vaivém</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={16}
                  value={draft.estagio}
                  onChange={(e) => setDraft({ ...draft, estagio: e.target.value })}
                  placeholder="Ex.: 5"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </label>
            )}
          </div>
          {beepVo2 !== null && (
            <p className="text-[11px] text-sky-300">VO2máx estimado: {fmt1(beepVo2)} ml/kg/min</p>
          )}

          <label className="block">
            <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Dia do teste</span>
            <input
              type="date"
              value={draft.data}
              max={todayISO()}
              onChange={(e) => setDraft({ ...draft, data: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {draft.id ? 'Salvar correção' : 'Salvar teste'}
          </button>
        </form>

        {/* Evolução e registros do teste escolhido */}
        <section className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Timer className="w-4 h-4 text-sky-400" /> {def.nome}
            </h3>
            {current ? (
              <p className="text-xs text-slate-400">
                Melhor: <strong className="text-emerald-300">{formatTest(current.best)}</strong> em {brDate(current.best.data)}
                {selected === 'beep' && <> • VO2máx {fmt1(testScore(current.best))}</>}
              </p>
            ) : (
              <p className="text-xs text-slate-400">Nenhum registro ainda. Faça o teste e salve o resultado em "Novo teste".</p>
            )}
          </div>

          {current && current.history.length > 1 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
              <TrendLine
                points={current.history.map((e) => ({ date: e.data, value: testScore(e) }))}
                format={(v) => (selected === 'beep' ? `VO2 ${fmt1(v)}` : `${fmt1(v)} ${def.unidade}`)}
                tickFormat={(v) => fmt1(Math.round(v))}
                minPad={1}
                ariaLabel={`Evolução: ${def.nome}`}
                color="#38bdf8"
                height={170}
              />
            </div>
          )}

          {current && (
            <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
              {[...current.history].reverse().map((e, i, list) => {
                const prev = list[i + 1];
                const diff = prev ? Math.round((testScore(e) - testScore(prev)) * 10) / 10 : null;
                return (
                  <li key={e.id} className={`flex items-center gap-3 px-3 py-2 text-xs ${draft.id === e.id ? 'bg-sky-500/10' : ''}`}>
                    <CalendarDays className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400 w-20 flex-shrink-0">{brDate(e.data)}</span>
                    <span className="font-bold text-white flex-1">{formatTest(e)}</span>
                    {diff === null ? (
                      <span className="text-[11px] text-slate-500">primeiro</span>
                    ) : diff > 0 ? (
                      <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3.5 h-3.5" /> {formatTestDiff(selected, diff)}
                      </span>
                    ) : diff < 0 ? (
                      <span className="text-[11px] font-bold text-amber-300 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3.5 h-3.5" /> {formatTestDiff(selected, diff)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                        <Minus className="w-3.5 h-3.5" /> igual
                      </span>
                    )}
                    <div className="flex items-center flex-shrink-0 -mr-1">
                      <button type="button" onClick={() => startEdit(e)} className="p-1.5 text-slate-500 hover:text-sky-300" title="Corrigir" aria-label={`Corrigir registro de ${brDate(e.data)}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => remove(e)} className="p-1.5 text-slate-500 hover:text-red-400" title="Apagar" aria-label={`Apagar registro de ${brDate(e.data)}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
