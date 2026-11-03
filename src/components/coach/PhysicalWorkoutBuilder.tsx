import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Dumbbell, Plus, Trash2, Loader2, Pencil, X, BookOpen } from 'lucide-react';

interface TrainingSessionItem {
  id: string;
  name: string;
  date: string;
  training_type: string;
}

interface ClubExercise {
  id: string;
  nome: string;
  exige_pr: boolean;
}

interface Prescription {
  id: string;
  bloco: string;
  exercicio: string;
  series: number | string;
  repeticoes: string;
  usa_pr: boolean;
  porcentagem_pr?: number | null;
  observacoes_tecnico?: string | null;
}

export function PhysicalWorkoutBuilder() {
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessions, setSessions] = useState<TrainingSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  
  const [catalog, setCatalog] = useState<ClubExercise[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showCatalogManager, setShowCatalogManager] = useState(false);
  
  // Estados para gerenciar edição ou criação no Catálogo Oficial
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [newCatNome, setNewCatNome] = useState('');
  const [newCatExigePr, setNewCatExigePr] = useState(true);
  const [savingCatalog, setSavingCatalog] = useState(false);

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);

  // Estados do formulário de prescrição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bloco, setBloco] = useState('Força Máxima');
  const [exercicio, setExercicio] = useState('');
  const [series, setSeries] = useState<number | string>(3);
  const [repeticoes, setRepeticoes] = useState('8-10');
  const [usaPr, setUsaPr] = useState(true);
  const [porcentagemPr, setPorcentagemPr] = useState<number | string>(70);
  const [obsTecnico, setObsTecnico] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadPhysicalSessions() {
      if (!supabase) return;
      setLoadingSessions(true);
      const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .order('date', { ascending: false });

      if (!error && data) {
        const fisicos = data.filter((s: any) => {
          const tipoTreino = (s.training_type || s.tipo || '').toLowerCase();
          return tipoTreino.includes('fisico') || tipoTreino.includes('físico');
        });
        
        setSessions(fisicos);
        if (fisicos.length > 0) {
          setSelectedSessionId(fisicos[0].id);
        }
      }
      setLoadingSessions(false);
    }
    loadPhysicalSessions();
  }, []);

  useEffect(() => {
    async function loadCatalog() {
      if (!supabase) return;
      setLoadingCatalog(true);
      const { data, error } = await supabase
        .from('club_exercises')
        .select('*')
        .order('nome');

      if (!error && data) {
        setCatalog(data);
        if (data.length > 0 && !exercicio) {
          setExercicio(data[0].nome);
          setUsaPr(data[0].exige_pr);
        }
      }
      setLoadingCatalog(false);
    }
    loadCatalog();
  }, []);

  useEffect(() => {
    if (!selectedSessionId || !supabase) {
      setPrescriptions([]);
      return;
    }
    const client = supabase;
    async function loadPrescriptions() {
      setLoadingPrescriptions(true);
      const { data, error } = await client
        .from('workout_prescriptions')
        .select('*')
        .eq('training_session_id', selectedSessionId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setPrescriptions(data);
      }
      setLoadingPrescriptions(false);
    }
    loadPrescriptions();
  }, [selectedSessionId]);

  const handleSelectCatalogExercise = (nomeEx: string) => {
    setExercicio(nomeEx);
    const encontrado = catalog.find(c => c.nome === nomeEx);
    if (encontrado) {
      setUsaPr(encontrado.exige_pr);
    }
  };

  const resetCatalogForm = () => {
    setEditingCatalogId(null);
    setNewCatNome('');
    setNewCatExigePr(true);
  };

  const startEditCatalog = (c: ClubExercise) => {
    setEditingCatalogId(c.id);
    setNewCatNome(c.nome);
    setNewCatExigePr(c.exige_pr);
  };

  async function handleSaveCatalogExercise(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatNome.trim() || !supabase) return;

    setSavingCatalog(true);
    const payload = {
      nome: newCatNome.trim(),
      bloco: 'Geral',
      exige_pr: newCatExigePr,
    };

    if (editingCatalogId) {
      // Atualizar exercício no catálogo
      const { error } = await supabase
        .from('club_exercises')
        .update(payload)
        .eq('id', editingCatalogId);

      setSavingCatalog(false);
      if (!error) {
        setCatalog(catalog.map(c => c.id === editingCatalogId ? { ...c, nome: payload.nome, exige_pr: payload.exige_pr } : c));
        resetCatalogForm();
      } else {
        alert(`Erro ao atualizar catálogo: ${error.message}`);
      }
    } else {
      // Inserir novo exercício no catálogo
      const { data, error } = await supabase
        .from('club_exercises')
        .insert([payload])
        .select()
        .single();

      setSavingCatalog(false);
      if (!error && data) {
        setCatalog([...catalog, data]);
        resetCatalogForm();
        handleSelectCatalogExercise(data.nome);
      } else {
        alert(`Erro ao cadastrar no catálogo (pode já existir): ${error?.message}`);
      }
    }
  }

  async function handleDeleteCatalogExercise(id: string) {
    if (!supabase) return;
    if (!confirm('Deseja remover este exercício do catálogo oficial?')) return;
    const { error } = await supabase.from('club_exercises').delete().eq('id', id);
    if (!error) {
      setCatalog(catalog.filter(c => c.id !== id));
      if (editingCatalogId === id) resetCatalogForm();
    }
  }

  const resetForm = () => {
    setEditingId(null);
    if (catalog.length > 0) {
      setExercicio(catalog[0].nome);
      setUsaPr(catalog[0].exige_pr);
    }
    setBloco('Força Máxima');
    setSeries(3);
    setRepeticoes('8-10');
    setPorcentagemPr(70);
    setObsTecnico('');
  };

  const startEdit = (p: Prescription) => {
    setEditingId(p.id);
    setBloco(p.bloco);
    setExercicio(p.exercicio);
    setSeries(p.series);
    setRepeticoes(p.repeticoes);
    setUsaPr(p.usa_pr);
    setPorcentagemPr(p.porcentagem_pr ?? 70);
    setObsTecnico(p.observacoes_tecnico ?? '');
  };

  async function handleSaveExercise(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSessionId || !exercicio.trim() || !supabase) return;

    setSaving(true);
    const payload = {
      training_session_id: selectedSessionId,
      bloco: bloco.trim() || 'Principal',
      exercicio: exercicio.trim(),
      series: Number(series) || 1,
      repeticoes: repeticoes.trim(),
      usa_pr: usaPr,
      porcentagem_pr: usaPr ? Number(porcentagemPr) || 0 : null,
      observacoes_tecnico: obsTecnico.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase
        .from('workout_prescriptions')
        .update(payload)
        .eq('id', editingId);

      setSaving(false);
      if (!error) {
        setPrescriptions(prescriptions.map(p => p.id === editingId ? { ...p, ...payload } : p));
        resetForm();
      } else {
        alert(`Erro ao atualizar: ${error.message}`);
      }
    } else {
      const { data, error } = await supabase
        .from('workout_prescriptions')
        .insert([payload])
        .select()
        .single();

      setSaving(false);
      if (!error && data) {
        setPrescriptions([...prescriptions, data]);
        resetForm();
      } else {
        alert(`Erro ao salvar: ${error?.message}`);
      }
    }
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    if (!confirm('Deseja remover este exercício da ficha?')) return;
    const { error } = await supabase.from('workout_prescriptions').delete().eq('id', id);
    if (!error) {
      setPrescriptions(prescriptions.filter(p => p.id !== id));
      if (editingId === id) resetForm();
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Montar Ficha de Preparação Física</h2>
            <p className="text-xs text-slate-400">Selecione o treino do cronograma e adicione os exercícios padronizados</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCatalogManager(!showCatalogManager)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold transition-all"
          >
            <BookOpen className="w-4 h-4" />
            <span>{showCatalogManager ? 'Ocultar Catálogo' : 'Gerenciar Catálogo Oficial'}</span>
          </button>

          <div className="w-full sm:w-64">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Treino Físico no Cronograma</label>
            {loadingSessions ? (
              <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-amber-400">Nenhum treino físico no cronograma.</p>
            ) : (
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:ring-2 focus:ring-sky-500"
              >
                {sessions.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.date} - {s.name || s.titulo}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Seção Retrátil: Catálogo Oficial com Edição */}
      {showCatalogManager && (
        <div className="bg-slate-900/95 border border-sky-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-400" /> Catálogo Oficial de Exercícios do Clube
              </h3>
              <p className="text-xs text-slate-400">Cadastre e edite os nomes oficiais e se exigem PR para padronizar as fichas</p>
            </div>
            <button type="button" onClick={() => setShowCatalogManager(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <form onSubmit={handleSaveCatalogExercise} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3 md:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{editingCatalogId ? 'Editar Exercício' : 'Adicionar ao Catálogo'}</span>
                {editingCatalogId && (
                  <button type="button" onClick={resetCatalogForm} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancelar
                  </button>
                )}
              </div>

              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nome Oficial</span>
                <input
                  type="text"
                  placeholder="Ex: Supino Reto, Agachamento..."
                  value={newCatNome}
                  onChange={(e) => setNewCatNome(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-400">Exige PR por padrão?</span>
                <input
                  type="checkbox"
                  checked={newCatExigePr}
                  onChange={(e) => setNewCatExigePr(e.target.checked)}
                  className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={savingCatalog}
                className={`w-full py-2 rounded-xl text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                  editingCatalogId ? 'bg-amber-400 hover:bg-amber-300' : 'bg-sky-500 hover:bg-sky-400'
                }`}
              >
                {savingCatalog && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingCatalogId ? 'Salvar Alterações' : 'Salvar no Catálogo'}
              </button>
            </form>

            <div className="md:col-span-2 bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2 max-h-56 overflow-y-auto">
              <span className="block text-xs font-bold text-white mb-2">Exercícios Disponíveis ({catalog.length})</span>
              {loadingCatalog ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-sky-400" /></div>
              ) : catalog.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Nenhum exercício cadastrado no catálogo ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {catalog.map((c) => (
                    <div key={c.id} className={`bg-slate-900 border p-2.5 rounded-xl flex items-center justify-between text-xs transition-colors ${editingCatalogId === c.id ? 'border-amber-500/80 bg-amber-950/10' : 'border-slate-800'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{c.nome}</span>
                        <span className="text-[10px] text-slate-400">({c.exige_pr ? 'Com PR' : 'Sem PR'})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditCatalog(c)}
                          className="text-slate-400 hover:text-amber-400 p-1.5"
                          title="Editar do catálogo"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCatalogExercise(c.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedSessionId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                {editingId ? <Pencil className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-sky-400" />}
                {editingId ? 'Editar Exercício' : 'Adicionar Exercício'}
              </h3>
              {editingId && (
                <button type="button" onClick={resetForm} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              )}
            </div>

            <form onSubmit={handleSaveExercise} className="space-y-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bloco de Treino (Livre)</span>
                <input
                  type="text"
                  placeholder="Ex: Força Máxima, Hipertrofia..."
                  value={bloco}
                  onChange={(e) => setBloco(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Exercício (Catálogo Oficial)</span>
                {catalog.length === 0 ? (
                  <p className="text-xs text-amber-400">Cadastre pelo menos um exercício no "Catálogo Oficial" acima.</p>
                ) : (
                  <select
                    value={exercicio}
                    onChange={(e) => handleSelectCatalogExercise(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {catalog.map((c) => (
                      <option key={c.id} value={c.nome}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Séries</span>
                  <input
                    type="number"
                    min="1"
                    value={series}
                    onChange={(e) => setSeries(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Repetições</span>
                  <input
                    type="text"
                    value={repeticoes}
                    onChange={(e) => setRepeticoes(e.target.value)}
                    placeholder="Ex: 8-10"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Calcular Carga por % do PR?</span>
                  <input
                    type="checkbox"
                    checked={usaPr}
                    onChange={(e) => setUsaPr(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </div>
                {usaPr && (
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">% do PR</span>
                    <input
                      type="number"
                      value={porcentagemPr}
                      onChange={(e) => setPorcentagemPr(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Observações (Opcional)</span>
                <input
                  type="text"
                  placeholder="Ex: Execução controlada..."
                  value={obsTecnico}
                  onChange={(e) => setObsTecnico(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                disabled={saving || catalog.length === 0}
                className={`w-full py-2.5 rounded-xl text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 mt-2 ${
                  editingId ? 'bg-amber-400 hover:bg-amber-300' : 'bg-sky-500 hover:bg-sky-400'
                }`}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Salvar Alterações' : 'Salvar Exercício'}
              </button>
            </form>
          </div>

          <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Exercícios Prescritos para o Treino</span>
              <span className="text-xs bg-slate-800 text-sky-400 px-2 py-0.5 rounded-md">{prescriptions.length} itens</span>
            </h3>

            {loadingPrescriptions ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-400" /></div>
            ) : prescriptions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Nenhum exercício adicionado a este treino físico ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {prescriptions.map((p) => (
                  <div key={p.id} className={`bg-slate-950 border p-3 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors ${editingId === p.id ? 'border-amber-500/80 bg-amber-950/10' : 'border-slate-800'}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold text-[10px]">{p.bloco}</span>
                        <span className="font-bold text-white">{p.exercicio}</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        {p.series} séries de {p.repeticoes} reps
                        {p.usa_pr && <strong className="text-emerald-400 ml-1">• {p.porcentagem_pr}% do PR</strong>}
                        {p.observacoes_tecnico && ` • Obs: ${p.observacoes_tecnico}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="p-2 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Editar exercício"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Remover exercício"
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
      )}
    </div>
  );
}