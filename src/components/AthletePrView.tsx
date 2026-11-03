import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Plus, Trash2, Loader2, Dumbbell } from 'lucide-react';

interface ClubExercise {
  id: string;
  nome: string;
  exige_pr: boolean;
}

interface AthletePr {
  id: string;
  athlete_id: string;
  exercicio: string;
  peso_pr: number;
}

interface AthletePrViewProps {
  athleteId: string; // ID do atleta logado
}

export function AthletePrView({ athleteId }: AthletePrViewProps) {
  const [catalog, setCatalog] = useState<ClubExercise[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [prs, setPrs] = useState<AthletePr[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(true);

  // Formulário de PR do atleta
  const [exercicioSelecionado, setExercicioSelecionado] = useState('');
  const [pesoPr, setPesoPr] = useState<number | string>(100);
  const [saving, setSaving] = useState(false);

  // Carregar apenas os exercícios do catálogo oficial que exigem PR
  useEffect(() => {
    async function loadCatalog() {
      if (!supabase) return;
      setLoadingCatalog(true);
      const { data, error } = await supabase
        .from('club_exercises')
        .select('*')
        .eq('exige_pr', true)
        .order('nome');

      if (!error && data) {
        setCatalog(data);
        if (data.length > 0) {
          setExercicioSelecionado(data[0].nome);
        }
      }
      setLoadingCatalog(false);
    }
    loadCatalog();
  }, []);

  // Carregar os PRs já cadastrados deste atleta
  useEffect(() => {
    if (!athleteId || !supabase) return;
    const client = supabase;
    async function loadAthletePrs() {
      setLoadingPrs(true);
      const { data, error } = await client
        .from('athlete_prs')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('exercicio');

      if (!error && data) {
        setPrs(data);
      }
      setLoadingPrs(false);
    }
    loadAthletePrs();
  }, [athleteId]);

  // Salvar ou atualizar PR
  async function handleSavePr(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteId || !exercicioSelecionado || !supabase) return;

    setSaving(true);
    const payload = {
      athlete_id: athleteId,
      exercicio: exercicioSelecionado,
      peso_pr: Number(pesoPr) || 0,
    };

    // Upsert garantindo unicidade por (athlete_id, exercicio)
    const { data, error } = await supabase
      .from('athlete_prs')
      .upsert([payload], { onConflict: 'athlete_id,exercicio' })
      .select()
      .single();

    setSaving(false);
    if (!error && data) {
      const filtered = prs.filter(p => p.exercicio.toLowerCase() !== payload.exercicio.toLowerCase());
      setPrs([...filtered, data]);
      setPesoPr(100);
    } else {
      alert(`Erro ao salvar PR: ${error?.message}`);
    }
  }

  // Deletar PR
  async function handleDelete(id: string) {
    if (!supabase) return;
    if (!confirm('Deseja remover este recorde pessoal?')) return;
    const { error } = await supabase.from('athlete_prs').delete().eq('id', id);
    if (!error) {
      setPrs(prs.filter(p => p.id !== id));
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-emerald-300" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Meus Recordes Pessoais (PRs)</h2>
          <p className="text-xs text-slate-400">Atualize suas cargas máximas (100%) para o cálculo automático dos treinos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulário de Atualização */}
        <div className="md:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Registar / Atualizar PR
          </h3>

          {loadingCatalog ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
          ) : catalog.length === 0 ? (
            <p className="text-xs text-amber-400">Nenhum exercício com PR configurado pelo treinador no catálogo oficial.</p>
          ) : (
            <form onSubmit={handleSavePr} className="space-y-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Exercício (Catálogo Oficial)</span>
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
              </div>

              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Carga Máxima (100% PR em kg)</span>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={pesoPr}
                  onChange={(e) => setPesoPr(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Insira o peso total máximo para 1 repetição (incluindo a barra).</span>
              </div>

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

        {/* Lista de PRs Cadastrados pelo Atleta */}
        <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span>Meus Recordes Atuais</span>
            <span className="text-xs bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md">{prs.length} registados</span>
          </h3>

          {loadingPrs ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : prs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Ainda não registaste nenhum PR. Seleciona um exercício ao lado e guarda a tua carga máxima!
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {prs.map((p) => (
                <div key={p.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                      <Dumbbell className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <span className="font-bold text-white block">{p.exercicio}</span>
                      <span className="text-emerald-400 font-semibold text-[11px]">{p.peso_pr} kg <span className="text-slate-500 font-normal">(100% PR)</span></span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    title="Excluir PR"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}