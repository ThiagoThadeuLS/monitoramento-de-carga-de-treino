import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Plus, Edit2, Trash2, Loader2, X } from 'lucide-react';

interface Adversario {
  id: string;
  nome: string;
  categoria_peso: string;
  classe_idade: 'juvenil' | 'júnior' | 'sênior';
  tipo_origem: 'pais' | 'clube';
  origem_valor: string;
  observacao?: string;
}

export function AdversaryManagement() {
  const [adversarios, setAdversarios] = useState<Adversario[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Estado do formulário
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState<string>('');
  const [categoriaPeso, setCategoriaPeso] = useState<string>('');
  const [classeIdade, setClasseIdade] = useState<'juvenil' | 'júnior' | 'sênior'>('sênior');
  const [tipoOrigem, setTipoOrigem] = useState<'pais' | 'clube'>('clube');
  const [origemValor, setOrigemValor] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');

  useEffect(() => {
    fetchAdversarios();
  }, []);

  async function fetchAdversarios() {
    setLoading(true);
    const { data, error } = await supabase.from('adversarios').select('*').order('nome');
    if (error) {
      console.error('Erro ao buscar adversários:', error);
    } else {
      setAdversarios(data || []);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !categoriaPeso || !origemValor) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const payload = {
      nome,
      categoria_peso: categoriaPeso,
      classe_idade: classeIdade,
      tipo_origem: tipoOrigem,
      origem_valor: origemValor,
      observacao,
    };

    if (editingId) {
      const { error } = await supabase
        .from('adversarios')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        alert('Erro ao atualizar adversário.');
        console.error(error);
      } else {
        resetForm();
        fetchAdversarios();
      }
    } else {
      const { error } = await supabase.from('adversarios').insert([payload]);

      if (error) {
        alert('Erro ao cadastrar adversário.');
        console.error(error);
      } else {
        resetForm();
        fetchAdversarios();
      }
    }
  }

  function handleEdit(adv: Adversario) {
    setEditingId(adv.id);
    setNome(adv.nome);
    setCategoriaPeso(adv.categoria_peso);
    setClasseIdade(adv.classe_idade);
    setTipoOrigem(adv.tipo_origem);
    setOrigemValor(adv.origem_valor);
    setObservacao(adv.observacao || '');
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este adversário?')) return;

    const { error } = await supabase.from('adversarios').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir adversário.');
    } else {
      fetchAdversarios();
    }
  }

  function resetForm() {
    setEditingId(null);
    setNome('');
    setCategoriaPeso('');
    setClasseIdade('sênior');
    setTipoOrigem('clube');
    setOrigemValor('');
    setObservacao('');
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Gestão de Atletas Adversários</h2>
            <p className="text-xs text-slate-400">Cadastre e gerencie informações de atletas de outros clubes ou países.</p>
          </div>
        </div>
      </div>

      {/* Formulário no mesmo estilo escuro */}
      <form onSubmit={handleSubmit} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Nome do Atleta</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            placeholder="Nome completo"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Categoria de Peso</label>
          <input
            type="text"
            value={categoriaPeso}
            onChange={(e) => setCategoriaPeso(e.target.value)}
            placeholder="Ex: -73kg, Pesado, etc."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Classe de Idade</label>
          <select
            value={classeIdade}
            onChange={(e) => setClasseIdade(e.target.value as any)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors capitalize"
          >
            <option value="juvenil">Juvenil</option>
            <option value="júnior">Júnior</option>
            <option value="sênior">Sênior</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Origem (Nacional / Internacional)</label>
          <div className="flex gap-4 mb-2 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipoOrigem"
                value="clube"
                checked={tipoOrigem === 'clube'}
                onChange={() => setTipoOrigem('clube')}
                className="accent-sky-500"
              />
              Clube (Nacional)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipoOrigem"
                value="pais"
                checked={tipoOrigem === 'pais'}
                onChange={() => setTipoOrigem('pais')}
                className="accent-sky-500"
              />
              País (Internacional)
            </label>
          </div>
          <input
            type="text"
            value={origemValor}
            onChange={(e) => setOrigemValor(e.target.value)}
            placeholder={tipoOrigem === 'pais' ? 'Ex: Brasil, França...' : 'Ex: Minas Tênis Clube, Flamengo...'}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Observações</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
            placeholder="Pontos fortes, estilo de luta, histórico, etc."
          />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black shadow-lg shadow-sky-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'Atualizar Adversário' : 'Cadastrar Adversário'}</span>
          </button>
        </div>
      </form>

      {/* Lista de Adversários */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Adversários Cadastrados</h3>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          </div>
        ) : adversarios.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Nenhum adversário cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-950/50">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Categoria / Idade</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Origem</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Observações</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {adversarios.map((adv) => (
                  <tr key={adv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{adv.nome}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {adv.categoria_peso} <span className="text-xs text-sky-400 font-semibold uppercase">({adv.classe_idade})</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      <span className="font-bold text-[10px] uppercase bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded mr-1.5">
                        {adv.tipo_origem === 'pais' ? 'País' : 'Clube'}
                      </span>
                      {adv.origem_valor}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400 max-w-xs truncate">{adv.observacao || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(adv)}
                        className="p-2 text-slate-400 hover:text-sky-400 transition-colors inline-block"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(adv.id)}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors inline-block ml-1"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}