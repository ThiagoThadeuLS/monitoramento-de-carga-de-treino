import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Plus, Trash2, Loader2, Dumbbell, AlertCircle, Share2, Sparkles, TrendingUp, X } from 'lucide-react';
import { AthletePr, CatalogExercise, deleteAthletePr, listAthletePrs, saveAthletePr } from '../lib/athleteAuth';
import { useDialogs } from './ui/Dialogs';
import { PrShareCard, ShareAthlete } from './athlete/PrShareCard';
import { brDate } from '../lib/export';

interface AthletePrViewProps {
  /** Token da sessão do atleta: o banco descobre quem ele é */
  token: string;
  /** Nome, foto e categoria (aparecem no card compartilhado) */
  athlete: ShareAthlete;
}

const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brDay = (iso?: string) => (iso ? brDate(iso.slice(0, 10)) : '');

interface NovoPr {
  exercicio: string;
  peso: number;
  anterior: number | null;
}

export function AthletePrView({ token, athlete }: AthletePrViewProps) {
  const { confirm, notify } = useDialogs();
  const share = useShareStory();
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [prs, setPrs] = useState<AthletePr[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [exercicioSelecionado, setExercicioSelecionado] = useState('');
  const [pesoPr, setPesoPr] = useState('');
  const [saving, setSaving] = useState(false);

  // PR recém-batido (destaque da tela) e card aberto para compartilhar
  const [novoPr, setNovoPr] = useState<NovoPr | null>(null);
  const [card, setCard] = useState<{ pr: AthletePr; novo: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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

  // Ao trocar de exercício, mostra o PR atual dele (se houver)
  useEffect(() => {
    const atual = prs.find((p) => p.exercicio.toLowerCase() === exercicioSelecionado.toLowerCase());
    setPesoPr(atual ? String(atual.peso_pr) : '');
  }, [exercicioSelecionado, prs]);

  async function handleSavePr(e: React.FormEvent) {
    e.preventDefault();
    const peso = Number(pesoPr.replace(',', '.'));
    if (!exercicioSelecionado || !Number.isFinite(peso) || peso <= 0 || peso > 500) {
      notify('Informe uma carga maior que zero e de até 500 kg.', 'error');
      return;
    }
    const anterior = prs.find((p) => p.exercicio.toLowerCase() === exercicioSelecionado.toLowerCase())?.peso_pr;
    setSaving(true);
    try {
      await saveAthletePr(token, exercicioSelecionado, peso);
      notify(`PR de ${exercicioSelecionado} salvo: ${fmtKg(peso)} kg.`, 'success');
      await load();
      // Bateu o recorde: abre o cartão para compartilhar (primeiro registro não abre sozinho)
      if (share && anterior !== undefined && peso > anterior) {
        share.openStory({ kind: 'pr', exercicio: exercicioSelecionado, peso, ganho: Math.round((peso - anterior) * 10) / 10 });
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pr: AthletePr) {
    const ok = await confirm({ message: `Remover o seu PR de ${pr.exercicio}?`, danger: true, confirmLabel: 'Remover' });
    if (!ok) return;
    try {
      await deleteAthletePr(token, pr.id);
      setPrs((list) => list.filter((p) => p.id !== pr.id));
      if (novoPr?.exercicio === pr.exercicio) setNovoPr(null);
      notify('PR removido.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  const recente = [...prs].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
  const prDoNovo = novoPr ? prs.find((p) => p.exercicio.toLowerCase() === novoPr.exercicio.toLowerCase()) : undefined;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white">Meus Recordes Pessoais (PRs)</h2>
          <p className="text-xs text-slate-400">Atualize suas cargas máximas (100%) para o cálculo automático dos treinos</p>
        </div>
        {recente && (
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
            <button
              type="button"
              onClick={() => setNovoPr(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-white"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulário de atualização */}
        <div className="md:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Registrar / atualizar PR
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
                  placeholder="Ex.: 100"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Peso total para 1 repetição (incluindo a barra).</span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 mt-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar PR
              </button>
            </form>
          )}
        </div>

        {/* Lista de PRs do atleta, com a evolução de cada um */}
        <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span>Meus recordes atuais</span>
            <span className="text-xs bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md">
              {prs.length} {prs.length === 1 ? 'registrado' : 'registrados'}
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
                return (
                  <div
                    key={p.id}
                    className={`border p-3 rounded-xl flex items-center justify-between gap-3 text-xs ${
                      eNovo ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
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
                        {hist.length > 1 && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                            <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            {delta > 0 ? `+${fmtKg(delta)} kg` : `${fmtKg(delta)} kg`} desde {brDay(hist[0]?.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setCard({ pr: p, novo: eNovo })}
                        className="p-2 text-slate-400 hover:text-sky-300 transition-colors"
                        title="Compartilhar este PR"
                        aria-label={`Compartilhar PR de ${p.exercicio}`}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Excluir PR"
                        aria-label={`Excluir PR de ${p.exercicio}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    {share && (
                      <button
                        type="button"
                        onClick={() => share.openStory({ kind: 'pr', exercicio: p.exercicio, peso: p.peso_pr, ganho: null })}
                        className="p-2 text-slate-500 hover:text-sky-300 transition-colors"
                        title="Compartilhar"
                        aria-label={`Compartilhar PR de ${p.exercicio}`}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                      title="Excluir PR"
                      aria-label={`Excluir PR de ${p.exercicio}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {card && (
        <PrShareCard
          athlete={athlete}
          pr={card.pr}
          prs={prs}
          novo={card.novo}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}
