import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Plus, Loader2, Dumbbell, AlertCircle, Share2, Sparkles, TrendingUp, X, Timer } from 'lucide-react';
import { AthletePr, CatalogExercise, addAthletePrEntry, deleteAthletePrEntry, listAthletePrs, updateAthletePrEntry } from '../lib/athleteAuth';
import { PrStep } from '../lib/prProgress';
import { todayISO } from '../lib/date';
import { useDialogs } from './ui/Dialogs';
import { PrShareCard, ShareAthlete } from './athlete/PrShareCard';
import { AthletePrProgress } from './athlete/AthletePrProgress';
import { AthleteTests } from './athlete/AthleteTests';
import { useShareStory } from './athlete/ShareStory';
import { brDate } from '../lib/export';

interface AthletePrViewProps {
  /** Token da sessão do atleta: o banco descobre quem ele é */
  token: string;
  /** Nome, foto e categoria (aparecem no card compartilhado) */
  athlete: ShareAthlete;
}

const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

interface NovoPr {
  exercicio: string;
  peso: number;
  anterior: number | null;
}

/** Dia do registro mais recente de um PR (registros de dias antigos não viram "novo PR"). */
const lastDay = (pr?: AthletePr) => (pr?.history ?? []).reduce((d, h) => (h.data && h.data > d ? h.data : d), '');

export function AthletePrView({ token, athlete }: AthletePrViewProps) {
  const { confirm, notify } = useDialogs();
  const share = useShareStory();
  // Cargas (PR) ou testes físicos (barra, beep test, CMJ)
  const [view, setView] = useState<'pr' | 'testes'>('pr');
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [prs, setPrs] = useState<AthletePr[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [exercicioSelecionado, setExercicioSelecionado] = useState('');
  const [pesoPr, setPesoPr] = useState('');
  const [dataPr, setDataPr] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  // Exercício aberto em "Meu progresso"
  const [foco, setFoco] = useState<string | undefined>(undefined);

  // PR recém-batido (destaque da tela) e card aberto para compartilhar
  const [novoPr, setNovoPr] = useState<NovoPr | null>(null);
  const [card, setCard] = useState<{ pr: AthletePr; novo: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await listAthletePrs(token);
      setCatalog(data.catalog);
      setPrs(data.prs);
      setExercicioSelecionado((atual) => (data.catalog.some((c) => c.nome === atual) ? atual : data.catalog[0]?.nome ?? ''));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const atualDoSelecionado = prs.find((p) => p.exercicio.toLowerCase() === exercicioSelecionado.toLowerCase());

  async function handleSavePr(e: React.FormEvent) {
    e.preventDefault();
    const peso = Number(pesoPr.replace(',', '.'));
    if (!exercicioSelecionado || !Number.isFinite(peso) || peso <= 0 || peso > 500) {
      notify('Informe uma carga maior que zero e de até 500 kg.', 'error');
      return;
    }
    if (!dataPr || dataPr > todayISO()) {
      notify('Escolha um dia até hoje.', 'error');
      return;
    }
    const anterior = atualDoSelecionado?.peso_pr;
    const ultimoDia = lastDay(atualDoSelecionado);
    const maisRecente = !ultimoDia || dataPr >= ultimoDia;
    setSaving(true);
    try {
      await addAthletePrEntry(token, exercicioSelecionado, peso, dataPr);
      notify(`Registro salvo: ${exercicioSelecionado}, ${fmtKg(peso)} kg.`, 'success');
      setPesoPr('');
      setDataPr(todayISO());
      setFoco(exercicioSelecionado);
      await load();
      // Bateu o recorde: destaca e abre o cartão para compartilhar (primeiro registro não abre sozinho)
      if (anterior !== undefined && maisRecente && peso > anterior) {
        setNovoPr({ exercicio: exercicioSelecionado, peso, anterior });
        share?.openStory({ kind: 'pr', exercicio: exercicioSelecionado, peso, ganho: Math.round((peso - anterior) * 10) / 10 });
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, peso: number, data: string) {
    if (!Number.isFinite(peso) || peso <= 0 || peso > 500) {
      notify('Informe uma carga maior que zero e de até 500 kg.', 'error');
      throw new Error('pr_invalido');
    }
    if (!data || data > todayISO()) {
      notify('Escolha um dia até hoje.', 'error');
      throw new Error('data_invalida');
    }
    try {
      await updateAthletePrEntry(token, id, peso, data);
      notify('Registro corrigido.', 'success');
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
      throw err;
    }
  }

  async function handleDeleteEntry(step: PrStep, exercicio: string) {
    if (!step.id) return;
    const pr = prs.find((p) => p.exercicio === exercicio);
    const unico = (pr?.history?.length ?? 0) <= 1;
    const ok = await confirm({
      message: unico
        ? `Apagar o único registro de ${exercicio}? O exercício fica sem PR.`
        : `Apagar o registro de ${fmtKg(step.peso)} kg (${brDate(step.date)}) em ${exercicio}?`,
      danger: true,
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await deleteAthletePrEntry(token, step.id);
      if (unico && novoPr?.exercicio === exercicio) setNovoPr(null);
      notify('Registro apagado.', 'success');
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  const recente = [...prs].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
  const prDoNovo = novoPr ? prs.find((p) => p.exercicio.toLowerCase() === novoPr.exercicio.toLowerCase()) : undefined;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white">PRs e testes</h2>
            <p className="text-xs text-slate-400">
              {view === 'pr'
                ? 'Suas cargas máximas (100%) para o cálculo automático dos treinos'
                : 'Barra, beep test e CMJ: registre cada teste e acompanhe a evolução'}
            </p>
          </div>
          {view === 'pr' && recente && (
            <button
              type="button"
              onClick={() => setCard({ pr: recente, novo: false })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex-shrink-0"
              title="Compartilhar meus recordes"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800" role="tablist" aria-label="PRs ou testes">
          {(
            [
              { id: 'pr', label: 'Cargas (PR)', icon: Dumbbell },
              { id: 'testes', label: 'Testes físicos', icon: Timer },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                view === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'testes' ? (
        <AthleteTests token={token} />
      ) : (
        <>
          {loadError && (
            <div className="p-3.5 rounded-xl border bg-red-950/60 border-red-600 text-red-300 flex items-center gap-2.5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Recorde novo: convite para ver o card */}
          {novoPr && (
            <div className="bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-sky-500/10 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white">Novo PR em {novoPr.exercicio}!</p>
                <p className="text-xs text-emerald-200/90">
                  {fmtKg(novoPr.peso)} kg
                  {novoPr.anterior !== null && (
                    <span className="text-emerald-300/80">
                      {' '}• {novoPr.peso - novoPr.anterior >= 0 ? '+' : ''}
                      {fmtKg(novoPr.peso - novoPr.anterior)} kg desde o último registro
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => prDoNovo && setCard({ pr: prDoNovo, novo: true })}
                  disabled={!prDoNovo}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold disabled:opacity-50"
                >
                  Ver card
                </button>
                <button type="button" onClick={() => setNovoPr(null)} className="p-2 rounded-xl text-slate-400 hover:text-white" aria-label="Fechar aviso">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Novo registro */}
            <div className="md:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" /> Novo registro de PR
              </h3>

              {loading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
              ) : catalog.length === 0 ? (
                <p className="text-xs text-amber-400">O treinador ainda não cadastrou exercícios com PR no catálogo do clube.</p>
              ) : (
                <form onSubmit={handleSavePr} className="space-y-3">
                  <label className="block">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Exercício (catálogo do clube)</span>
                    <select
                      value={exercicioSelecionado}
                      onChange={(e) => setExercicioSelecionado(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {catalog.map((c) => (
                        <option key={c.id} value={c.nome}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    {atualDoSelecionado && (
                      <span className="text-[10px] text-slate-500 mt-1 block">PR atual: {fmtKg(atualDoSelecionado.peso_pr)} kg</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Carga máxima (100% do PR, em kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0.5"
                      max="500"
                      value={pesoPr}
                      onChange={(e) => setPesoPr(e.target.value)}
                      placeholder={atualDoSelecionado ? `Atual: ${fmtKg(atualDoSelecionado.peso_pr)}` : 'Ex.: 100'}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Peso total para 1 repetição (incluindo a barra).</span>
                  </label>

                  <label className="block">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Dia do teste</span>
                    <input
                      type="date"
                      value={dataPr}
                      max={todayISO()}
                      onChange={(e) => setDataPr(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 mt-2"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar registro
                  </button>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Cada registro fica no seu histórico. O PR usado nas fichas é sempre o registro mais recente.
                  </p>
                </form>
              )}
            </div>

            {/* PRs atuais (tocar abre a evolução) */}
            <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Meus recordes atuais</span>
                <span className="text-xs bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md">
                  {prs.length} {prs.length === 1 ? 'exercício' : 'exercícios'}
                </span>
              </h3>

              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
              ) : prs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  Você ainda não registrou nenhum PR. Escolha um exercício ao lado e salve sua carga máxima!
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {prs.map((p) => {
                    const hist = p.history ?? [];
                    const primeiro = hist[0]?.peso_pr ?? p.peso_pr;
                    const delta = p.peso_pr - primeiro;
                    const eNovo = novoPr?.exercicio.toLowerCase() === p.exercicio.toLowerCase();
                    const aberto = (foco ?? recente?.exercicio) === p.exercicio;
                    return (
                      <div
                        key={p.id}
                        className={`border p-3 rounded-xl flex items-center justify-between gap-3 text-xs ${
                          eNovo ? 'bg-emerald-500/10 border-emerald-500/50' : aberto ? 'bg-slate-950 border-sky-500/50' : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <button type="button" onClick={() => setFoco(p.exercicio)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                            <Dumbbell className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate">
                              {p.exercicio}
                              {eNovo && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 align-middle">NOVO</span>}
                            </span>
                            <span className="text-emerald-400 font-semibold text-[11px]">
                              {fmtKg(p.peso_pr)} kg <span className="text-slate-500 font-normal">(100% PR)</span>
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                              <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                              {hist.length > 1
                                ? `${delta > 0 ? '+' : ''}${fmtKg(delta)} kg em ${hist.length} registros`
                                : '1 registro'}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCard({ pr: p, novo: eNovo })}
                          className="p-2 text-slate-400 hover:text-sky-300 transition-colors flex-shrink-0"
                          title="Compartilhar este PR"
                          aria-label={`Compartilhar PR de ${p.exercicio}`}
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!loading && prs.length > 0 && (
            <AthletePrProgress
              prs={prs}
              selected={foco ?? novoPr?.exercicio}
              onSelect={setFoco}
              onUpdate={handleUpdate}
              onDelete={handleDeleteEntry}
            />
          )}
        </>
      )}

      {card && <PrShareCard athlete={athlete} pr={card.pr} prs={prs} novo={card.novo} onClose={() => setCard(null)} />}
    </div>
  );
}
