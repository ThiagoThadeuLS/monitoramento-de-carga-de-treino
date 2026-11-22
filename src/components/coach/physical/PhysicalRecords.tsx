import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Download, Dumbbell, Loader2, Plus, RefreshCw, Search, Timer, Trash2, X } from 'lucide-react';
import { deleteById, supabase } from '../../../lib/supabase';
import { useClub } from '../../../lib/club';
import { ClubAthlete, fetchClubAthletes } from '../../../lib/athletes';
import { brDate, downloadCsv, fileSlug, toCsv } from '../../../lib/export';
import { todayISO } from '../../../lib/date';
import {
  PHYSICAL_TESTS,
  PhysicalTestEntry,
  PhysicalTestKind,
  TestSummary,
  estimateVo2,
  formatTest,
  formatTestDiff,
  normalizeTests,
  summarizeTests,
  testDef,
  validateTest,
} from '../../../lib/physicalTests';
import { Avatar } from '../../ui/Avatar';
import { useDialogs } from '../../ui/Dialogs';

interface PrRow {
  id: string;
  athlete_id: string;
  exercicio: string;
  peso_pr: number;
  updated_at?: string;
}

interface PrHistoryRow {
  id: string;
  athlete_id: string;
  exercicio: string;
  peso_pr: number;
  data: string;
  created_at?: string;
}

const PAGE = 1000;

/** Lê a tabela inteira do clube (o RLS já limita ao clube), de 1000 em 1000. */
async function fetchAll<T>(table: string, columns: string, order: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    let q = supabase!.from(table).select(columns);
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const key = (s: string) => s.trim().toLowerCase();
const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const shortDay = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');

/**
 * Prep. física → PRs e testes: todos os PRs do elenco (exercícios do catálogo que pedem PR)
 * e os testes físicos (barra, beep test, CMJ), com o histórico de cada atleta.
 */
export function PhysicalRecords() {
  const { club } = useClub();
  const clubId = club?.id ?? null;
  const { confirm, notify } = useDialogs();
  const [view, setView] = useState<'pr' | 'testes'>('pr');
  const [athletes, setAthletes] = useState<ClubAthlete[]>([]);
  const [exercises, setExercises] = useState<string[]>([]);
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [history, setHistory] = useState<PrHistoryRow[]>([]);
  const [tests, setTests] = useState<PhysicalTestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      fetchClubAthletes(clubId, reloadKey > 0),
      supabase!.from('club_exercises').select('nome').eq('exige_pr', true).order('nome'),
      fetchAll<PrRow>('athlete_prs', 'id, athlete_id, exercicio, peso_pr, updated_at', ['id']),
      fetchAll<PrHistoryRow>('athlete_pr_history', 'id, athlete_id, exercicio, peso_pr, data, created_at', ['data', 'id']),
      fetchAll<PhysicalTestEntry>('physical_tests', 'id, athlete_id, teste, data, valor, estagio, created_at', ['data', 'id']),
    ])
      .then(([list, cat, prRows, histRows, testRows]) => {
        if (cancelled) return;
        if (cat.error) throw cat.error;
        setAthletes(list);
        setExercises(((cat.data ?? []) as { nome: string }[]).map((e) => e.nome));
        setPrs(prRows.map((p) => ({ ...p, peso_pr: Number(p.peso_pr) })));
        setHistory(histRows.map((h) => ({ ...h, peso_pr: Number(h.peso_pr) })));
        setTests(normalizeTests(testRows));
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = (err as { message?: string })?.message ?? String(err);
        setError(
          /physical_tests|does not exist|schema cache/i.test(msg)
            ? 'Os testes físicos ainda não foram ativados no banco. Rode o supabase_completo.sql no Supabase e atualize.'
            : msg
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clubId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const visible = useMemo(() => {
    const q = key(search);
    return athletes
      .filter((a) => showInactive || a.active)
      .filter((a) => !q || key(a.nome).includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [athletes, search, showInactive]);

  // PR atual por atleta e exercício (só exercícios do catálogo que pedem PR)
  const prByAthlete = useMemo(() => {
    const m = new Map<string, Map<string, PrRow>>();
    for (const p of prs) {
      const inner = m.get(p.athlete_id) ?? new Map<string, PrRow>();
      inner.set(key(p.exercicio), p);
      m.set(p.athlete_id, inner);
    }
    return m;
  }, [prs]);

  const historyByAthlete = useMemo(() => {
    const m = new Map<string, PrHistoryRow[]>();
    for (const h of history) {
      const list = m.get(h.athlete_id) ?? [];
      list.push(h);
      m.set(h.athlete_id, list);
    }
    return m;
  }, [history]);

  const testsByAthlete = useMemo(() => {
    const m = new Map<string, Map<PhysicalTestKind, TestSummary>>();
    const grouped = new Map<string, PhysicalTestEntry[]>();
    for (const t of tests) {
      const list = grouped.get(t.athlete_id!) ?? [];
      list.push(t);
      grouped.set(t.athlete_id!, list);
    }
    for (const [id, list] of grouped) m.set(id, summarizeTests(list));
    return m;
  }, [tests]);

  // Último dia de cada PR (vem do histórico)
  const lastDayOf = (athleteId: string, exercicio: string) =>
    (historyByAthlete.get(athleteId) ?? [])
      .filter((h) => key(h.exercicio) === key(exercicio))
      .reduce((d, h) => (h.data > d ? h.data : d), '');

  const withPr = visible.filter((a) => exercises.some((e) => prByAthlete.get(a.id)?.has(key(e)))).length;
  const withTest = visible.filter((a) => testsByAthlete.get(a.id)?.size).length;

  const exportCsv = () => {
    const names = new Map(athletes.map((a) => [a.id, a.nome]));
    const ids = new Set(visible.map((a) => a.id));
    type Line = { atleta: string; tipo: string; item: string; dia: string; resultado: string; valor: number; extra: string };
    const lines: Line[] = [
      ...history
        .filter((h) => ids.has(h.athlete_id))
        .map((h) => ({ atleta: names.get(h.athlete_id) ?? '', tipo: 'PR', item: h.exercicio, dia: h.data, resultado: `${fmtKg(h.peso_pr)} kg`, valor: h.peso_pr, extra: '' })),
      ...tests
        .filter((t) => ids.has(t.athlete_id!))
        .map((t) => ({
          atleta: names.get(t.athlete_id!) ?? '',
          tipo: 'Teste',
          item: testDef(t.teste)?.nome ?? t.teste,
          dia: t.data,
          resultado: formatTest(t),
          valor: t.valor,
          extra: t.teste === 'beep' ? `VO2máx ${estimateVo2(t.valor, t.estagio).toLocaleString('pt-BR')}` : '',
        })),
    ].sort((a, b) => a.atleta.localeCompare(b.atleta, 'pt-BR') || a.tipo.localeCompare(b.tipo) || a.item.localeCompare(b.item) || a.dia.localeCompare(b.dia));
    downloadCsv(
      fileSlug('prs_e_testes', todayISO()),
      toCsv(lines, [
        { label: 'Atleta', value: (l) => l.atleta },
        { label: 'Tipo', value: (l) => l.tipo },
        { label: 'Exercício / teste', value: (l) => l.item },
        { label: 'Dia', value: (l) => brDate(l.dia) },
        { label: 'Resultado', value: (l) => l.resultado },
        { label: 'Valor', value: (l) => l.valor },
        { label: 'Observação', value: (l) => l.extra },
      ])
    );
  };

  const removeTest = async (t: PhysicalTestEntry, nome: string) => {
    const ok = await confirm({
      message: `Apagar o teste de ${nome}: ${testDef(t.teste)?.curto} ${formatTest(t)} (${brDate(t.data)})?`,
      danger: true,
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await deleteById('physical_tests', t.id);
      setTests((list) => list.filter((x) => x.id !== t.id));
      notify('Teste apagado.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">PRs e testes do elenco</h3>
            <p className="text-[11px] text-slate-500">
              {view === 'pr'
                ? `PR atual de cada exercício que pede PR • ${withPr} de ${visible.length} atletas com registro`
                : `Último resultado de cada teste • ${withTest} de ${visible.length} atletas com registro`}
            </p>
          </div>
          <button type="button" onClick={exportCsv} disabled={loading} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50" title="Baixar planilha (Excel)" aria-label="Baixar planilha">
            <Download className="w-4 h-4" />
          </button>
          <button type="button" onClick={reload} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200" title="Atualizar" aria-label="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800" role="tablist">
            {(
              [
                { id: 'pr', label: 'PRs', icon: Dumbbell },
                { id: 'testes', label: 'Testes', icon: Timer },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={view === t.id}
                onClick={() => {
                  setView(t.id);
                  setOpen(null);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                  view === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar atleta"
              className="bg-transparent text-xs text-white outline-none flex-1 min-w-0"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-sky-500" />
            Inativos
          </label>
          {view === 'testes' && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
            >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showForm ? 'Fechar' : 'Registrar teste'}
            </button>
          )}
        </div>
      </header>

      {view === 'testes' && showForm && !loading && !error && (
        <CoachTestForm
          athletes={athletes.filter((a) => a.active)}
          onSaved={(entry) => {
            setTests((list) => [...list, entry]);
            setOpen(entry.athlete_id ?? null);
          }}
        />
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : error ? (
        <p className="m-4 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </p>
      ) : view === 'pr' && exercises.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500">
          Nenhum exercício do catálogo pede PR. Marque "Exige PR" no catálogo de exercícios (aba Fichas).
        </p>
      ) : visible.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500">Nenhum atleta encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 border-b border-slate-800 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 bg-slate-950 z-10 min-w-[170px]">Atleta</th>
                {(view === 'pr' ? exercises : PHYSICAL_TESTS.map((t) => t.curto)).map((label) => (
                  <th key={label} className="py-2.5 px-3 text-right whitespace-nowrap">
                    {label}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {visible.map((a) => {
                const isOpen = open === a.id;
                const colCount = (view === 'pr' ? exercises.length : PHYSICAL_TESTS.length) + 2;
                return (
                  <React.Fragment key={a.id}>
                    <tr onClick={() => setOpen(isOpen ? null : a.id)} className={`cursor-pointer hover:bg-slate-800/40 ${isOpen ? 'bg-slate-800/30' : ''}`}>
                      <td className="py-2 px-3 sticky left-0 bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                          <Avatar name={a.nome} src={a.photo_url} className="w-7 h-7" textClassName="text-[10px]" />
                          <div className="min-w-0">
                            <p className={`font-bold leading-tight truncate max-w-[150px] ${a.active ? 'text-white' : 'text-slate-500'}`}>{a.nome}</p>
                            <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{[a.classe, a.categoria].filter(Boolean).join(' • ')}</p>
                          </div>
                        </div>
                      </td>
                      {view === 'pr'
                        ? exercises.map((ex) => {
                            const p = prByAthlete.get(a.id)?.get(key(ex));
                            return (
                              <td key={ex} className="py-2 px-3 text-right whitespace-nowrap">
                                {p ? (
                                  <>
                                    <span className="font-black text-emerald-300 tabular-nums">{fmtKg(p.peso_pr)} kg</span>
                                    <span className="block text-[10px] text-slate-500">{shortDay(lastDayOf(a.id, ex))}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                            );
                          })
                        : PHYSICAL_TESTS.map((t) => {
                            const s = testsByAthlete.get(a.id)?.get(t.id);
                            return (
                              <td key={t.id} className="py-2 px-3 text-right whitespace-nowrap">
                                {s ? (
                                  <>
                                    <span className="font-black text-sky-300 tabular-nums">{formatTest(s.latest)}</span>
                                    <span className="block text-[10px] text-slate-500">
                                      {shortDay(s.latest.data)}
                                      {s.diff !== null && s.diff !== 0 && (
                                        <span className={s.diff > 0 ? 'text-emerald-400' : 'text-amber-300'}> {formatTestDiff(t.id, s.diff)}</span>
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                            );
                          })}
                      <td className="pr-3">
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-950/60">
                        <td colSpan={colCount} className="px-3 py-3">
                          {view === 'pr' ? (
                            <PrHistoryDetail rows={historyByAthlete.get(a.id) ?? []} exercises={exercises} />
                          ) : (
                            <TestHistoryDetail summaries={testsByAthlete.get(a.id)} onDelete={(t) => removeTest(t, a.nome)} />
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Histórico de PRs de um atleta, por exercício (do mais novo para o mais antigo). */
const PrHistoryDetail: React.FC<{ rows: PrHistoryRow[]; exercises: string[] }> = ({ rows, exercises }) => {
  const groups = exercises
    .map((ex) => ({
      ex,
      list: rows
        .filter((r) => key(r.exercicio) === key(ex))
        .sort((a, b) => b.data.localeCompare(a.data) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    }))
    .filter((g) => g.list.length > 0);
  if (groups.length === 0) return <p className="text-[11px] text-slate-500">Este atleta ainda não registrou PR.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {groups.map((g) => {
        const best = Math.max(...g.list.map((r) => r.peso_pr));
        return (
          <div key={g.ex} className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
            <p className="text-[11px] font-bold text-white mb-1 flex items-center justify-between gap-2">
              <span className="truncate">{g.ex}</span>
              <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0">melhor {fmtKg(best)} kg</span>
            </p>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {g.list.map((r, i) => (
                <li key={r.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">{brDate(r.data)}</span>
                  <span className={`tabular-nums font-bold ${i === 0 ? 'text-emerald-300' : 'text-slate-300'}`}>{fmtKg(r.peso_pr)} kg</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

/** Histórico dos testes de um atleta, por teste. */
const TestHistoryDetail: React.FC<{
  summaries?: Map<PhysicalTestKind, TestSummary>;
  onDelete: (t: PhysicalTestEntry) => void;
}> = ({ summaries, onDelete }) => {
  if (!summaries || summaries.size === 0) return <p className="text-[11px] text-slate-500">Este atleta ainda não registrou testes.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      {PHYSICAL_TESTS.filter((t) => summaries.has(t.id)).map((t) => {
        const s = summaries.get(t.id)!;
        return (
          <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
            <p className="text-[11px] font-bold text-white mb-1 flex items-center justify-between gap-2">
              <span className="truncate">{t.curto}</span>
              <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0">melhor {formatTest(s.best)}</span>
            </p>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {[...s.history].reverse().map((e, i) => (
                <li key={e.id} className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-400 flex-1">{brDate(e.data)}</span>
                  <span className={`tabular-nums font-bold ${i === 0 ? 'text-sky-300' : 'text-slate-300'}`}>
                    {formatTest(e)}
                    {e.teste === 'beep' && <span className="text-slate-500 font-normal"> • VO2 {estimateVo2(e.valor, e.estagio).toLocaleString('pt-BR')}</span>}
                  </span>
                  <button type="button" onClick={() => onDelete(e)} className="p-1 text-slate-600 hover:text-red-400" title="Apagar" aria-label={`Apagar teste de ${brDate(e.data)}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

/** A comissão registra um teste para um atleta (ex.: beep test aplicado no grupo). */
const CoachTestForm: React.FC<{ athletes: ClubAthlete[]; onSaved: (entry: PhysicalTestEntry) => void }> = ({ athletes, onSaved }) => {
  const { notify } = useDialogs();
  const [athleteId, setAthleteId] = useState('');
  const [teste, setTeste] = useState<PhysicalTestKind>('barra_reps');
  const [data, setData] = useState(todayISO());
  const [valor, setValor] = useState('');
  const [estagio, setEstagio] = useState('');
  const [saving, setSaving] = useState(false);
  const def = testDef(teste)!;
  const sorted = useMemo(() => [...athletes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [athletes]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(valor.replace(',', '.'));
    const st = teste === 'beep' && estagio.trim() ? Number(estagio) : null;
    if (!athleteId) {
      notify('Escolha o atleta.', 'error');
      return;
    }
    const problem = validateTest(teste, v, st);
    if (problem) {
      notify(problem, 'error');
      return;
    }
    if (!data || data > todayISO()) {
      notify('Escolha um dia até hoje.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data: row, error } = await supabase!
        .from('physical_tests')
        .insert({ athlete_id: athleteId, teste, data, valor: v, estagio: st })
        .select('id, athlete_id, teste, data, valor, estagio, created_at')
        .single();
      if (error) throw error;
      onSaved(normalizeTests([row as PhysicalTestEntry])[0]);
      notify('Teste registrado.', 'success');
      setValor('');
      setEstagio('');
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      notify(/row-level|permission/i.test(msg) ? 'Sem permissão para registrar (modo suporte é só leitura).' : msg || 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="px-4 py-3 border-b border-slate-800 bg-slate-950/50 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
      <label className="col-span-2 block">
        <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Atleta</span>
        <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
          <option value="">Escolha…</option>
          {sorted.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 md:col-span-1 block">
        <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Teste</span>
        <select
          value={teste}
          onChange={(e) => {
            setTeste(e.target.value as PhysicalTestKind);
            setEstagio('');
          }}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
        >
          {PHYSICAL_TESTS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.curto}
            </option>
          ))}
        </select>
      </label>
      <div className={`block ${teste === 'beep' ? 'grid grid-cols-2 gap-1.5' : ''}`}>
        <label className="block">
          <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{teste === 'beep' ? 'Nível' : def.unidade}</span>
          <input
            type="number"
            inputMode="decimal"
            step={def.inteiro ? 1 : 0.1}
            min={def.min}
            max={def.max}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </label>
        {teste === 'beep' && (
          <label className="block">
            <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Vaivém</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={16}
              value={estagio}
              onChange={(e) => setEstagio(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </label>
        )}
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Dia</span>
        <input type="date" value={data} max={todayISO()} onChange={(e) => setData(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white" />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="col-span-2 md:col-span-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
      </button>
    </form>
  );
};
