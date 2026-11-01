import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Edit3, Trash2, CheckCircle2, AlertCircle, X, Loader2, Phone, IdCard, KeyRound } from 'lucide-react';
import { Athlete } from '../../types';
import { supabase } from '../../lib/supabase';
import { CLASSES, CATEGORIAS } from '../../data/constants';
import { formatCpf, isValidCpf, onlyCpfDigits } from '../../lib/cpf';
import { resetAthletePassword } from '../../lib/athleteAuth';

interface AthleteManagementProps {
  athleteToEdit?: Athlete | null;
  onClearAthleteToEdit?: () => void;
  /** Modo suporte (Área Restrita): só visualiza, sem cadastrar/editar/excluir */
  readOnly?: boolean;
}

export const AthleteManagement: React.FC<AthleteManagementProps> = ({
  athleteToEdit,
  onClearAthleteToEdit,
  readOnly = false,
}) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);

  // Form State
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [classe, setClasse] = useState(CLASSES[0]);
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [celular, setCelular] = useState('');
  const [sexo, setSexo] = useState('Masculino');
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [modalError, setModalError] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAthletes = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .order('nome');

      if (!error && data) {
        setAthletes(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAthletes();
  }, []);

  useEffect(() => {
    if (athleteToEdit) {
      handleOpenEditModal(athleteToEdit);
      if (onClearAthleteToEdit) {
        onClearAthleteToEdit();
      }
    }
  }, [athleteToEdit]);

  const handleOpenAddModal = () => {
    setEditingAthlete(null);
    setNome('');
    setCpf('');
    setModalError('');
    setClasse(CLASSES[0]);
    setCategoria(CATEGORIAS[0]);
    setCelular('');
    setSexo('Masculino');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (athlete: Athlete) => {
    setEditingAthlete(athlete);
    setNome(athlete.nome);
    setCpf(formatCpf(athlete.cpf || ''));
    setModalError('');
    setClasse(athlete.classe || CLASSES[0]);
    setCategoria(athlete.categoria || CATEGORIAS[0]);
    setCelular(athlete.celular || '');
    setSexo(athlete.sexo || 'Masculino');
    setIsModalOpen(true);
  };

  const handleSaveAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    // Erros de validação aparecem dentro do modal (o aviso geral fica escondido atrás dele)
    if (!nome.trim()) {
      setModalError('O nome do atleta é obrigatório.');
      return;
    }
    if (!isValidCpf(cpf)) {
      setModalError('Informe um CPF válido. Ele será o login do atleta.');
      return;
    }

    if (!supabase) return;
    setSubmitting(true);
    setModalError('');
    setFeedbackMsg(null);

    try {
      if (editingAthlete) {
        // Atualizar atleta existente
        const { error } = await supabase
          .from('athletes')
          .update({
            nome: nome.trim(),
            cpf: onlyCpfDigits(cpf),
            classe: classe.trim(),
            categoria: categoria.trim(),
            celular: celular.trim(),
            sexo: sexo.trim(),
          })
          .eq('id', editingAthlete.id);

        if (error) throw error;
        setFeedbackMsg({ type: 'success', text: `Dados de "${nome.trim()}" atualizados com sucesso!` });
      } else {
        // Criar novo atleta
        const { error } = await supabase.from('athletes').insert([
          {
            nome: nome.trim(),
            cpf: onlyCpfDigits(cpf),
            classe: classe.trim(),
            categoria: categoria.trim(),
            celular: celular.trim(),
            sexo: sexo.trim(),
            active: true,
          },
        ]);

        if (error) throw error;
        setFeedbackMsg({
          type: 'success',
          text: `Atleta "${nome.trim()}" cadastrado! Login: CPF • Senha inicial: nome completo junto e minúsculo.`,
        });
      }

      setIsModalOpen(false);
      await loadAthletes();
      setTimeout(() => setFeedbackMsg(null), 6000);
    } catch (err: any) {
      if (err.code === '23505' && String(err.message).includes('cpf')) {
        setModalError('Já existe um atleta cadastrado com este CPF.');
      } else if (err.code === 'PGRST204' || String(err.message).includes("'cpf' column")) {
        setModalError('O banco ainda não tem o campo CPF. Rode o arquivo supabase_completo.sql no Supabase.');
      } else {
        setModalError(`Erro ao salvar atleta: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingAthlete) return;
    if (!window.confirm(
      `Voltar a senha de "${editingAthlete.nome}" para a senha inicial (nome completo junto e minúsculo)? ` +
      'O atleta terá que criar uma nova senha no próximo acesso.'
    )) {
      return;
    }

    setResettingPassword(true);
    setModalError('');
    try {
      await resetAthletePassword(editingAthlete.id);
      setIsModalOpen(false);
      setFeedbackMsg({ type: 'success', text: `Senha de "${editingAthlete.nome}" redefinida para a senha inicial.` });
      setTimeout(() => setFeedbackMsg(null), 6000);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteAthlete = async (id: string, athleteName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o atleta "${athleteName}"?`)) {
      return;
    }

    if (!supabase) return;
    try {
      const { error } = await supabase.from('athletes').delete().eq('id', id);
      if (error) throw error;
      setFeedbackMsg({ type: 'success', text: `Atleta "${athleteName}" removido com sucesso.` });
      await loadAthletes();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `Erro ao excluir: ${err.message}` });
    }
  };

  const searchDigits = onlyCpfDigits(search);
  const filteredAthletes = athletes.filter((a) =>
    a.nome.toLowerCase().includes(search.toLowerCase()) ||
    (searchDigits.length >= 3 && a.cpf?.includes(searchDigits)) ||
    (a.categoria && a.categoria.toLowerCase().includes(search.toLowerCase())) ||
    (a.classe && a.classe.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CPF, categoria ou classe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {!readOnly && <button
          type="button"
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Novo Atleta</span>
        </button>}
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs sm:text-sm animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
              : 'bg-red-950/60 border-red-600 text-red-300'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* LISTAGEM DE ATLETAS */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando elenco...</p>
        </div>
      ) : filteredAthletes.length === 0 ? (
        <div className="py-16 text-center text-slate-400 space-y-2 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <p className="text-base font-semibold text-slate-300">Nenhum atleta encontrado</p>
          <p className="text-xs">Clique no botão "Cadastrar Novo Atleta" para adicionar.</p>
        </div>
      ) : (
        <>
          {/* VISUALIZAÇÃO MOBILE (Cards com Botões Grandes de Editar e Excluir) */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredAthletes.map((athlete) => (
              <div
                key={athlete.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-white leading-tight">
                      {athlete.nome}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {athlete.categoria || 'Geral'} • {athlete.sexo || 'Não informado'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs flex-shrink-0">
                    Classe {athlete.classe || 'A'}
                  </span>
                </div>

                <p className={`text-xs flex items-center gap-1.5 pt-1 ${athlete.cpf ? 'text-slate-400' : 'text-amber-400'}`}>
                  <IdCard className="w-3.5 h-3.5 text-sky-400" />
                  <span>{athlete.cpf ? formatCpf(athlete.cpf) : 'Sem CPF — atleta não consegue entrar'}</span>
                </p>

                {athlete.celular && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-sky-400" />
                    <span>{athlete.celular}</span>
                  </p>
                )}

                {/* BOTÕES DE AÇÃO DESTACADOS NO MOBILE */}
                {!readOnly && <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(athlete)}
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:bg-sky-500/30 text-sky-400 border border-sky-500/30 font-bold text-xs transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Atleta</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteAthlete(athlete.id, athlete.nome)}
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 border border-red-500/20 font-bold text-xs transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                </div>}
              </div>
            ))}
          </div>

          {/* VISUALIZAÇÃO DESKTOP (Tabela com Botões Explícitos) */}
          <div className="hidden sm:block bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Nome do Atleta</th>
                    <th className="py-3.5 px-3">CPF</th>
                    <th className="py-3.5 px-3">Classe</th>
                    <th className="py-3.5 px-3">Categoria</th>
                    <th className="py-3.5 px-3">Celular</th>
                    <th className="py-3.5 px-3">Sexo</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAthletes.map((athlete) => (
                    <tr key={athlete.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">
                        {athlete.nome}
                      </td>
                      <td className={`py-3.5 px-3 text-xs whitespace-nowrap ${athlete.cpf ? 'text-slate-400' : 'text-amber-400'}`}>
                        {athlete.cpf ? formatCpf(athlete.cpf) : 'Sem CPF'}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-xs">
                          Classe {athlete.classe || 'A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-300 text-xs sm:text-sm">
                        {athlete.categoria || '—'}
                      </td>
                      <td className="py-3.5 px-3 text-slate-400 text-xs">
                        {athlete.celular || '—'}
                      </td>
                      <td className="py-3.5 px-3 text-slate-400 text-xs">
                        {athlete.sexo || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!readOnly && <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(athlete)}
                            className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 active:bg-sky-500/30 text-sky-400 border border-sky-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors"
                            title="Editar Dados do Atleta"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAthlete(athlete.id, athlete.nome)}
                            className="px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-semibold transition-colors"
                            title="Excluir Atleta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Adicionar / Editar Atleta */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-400" />
                {editingAthlete ? `Editar Atleta: ${editingAthlete.nome}` : 'Cadastrar Novo Atleta'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAthlete} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="ex: Arthur Silva"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  A senha inicial do atleta será o nome completo, tudo junto e minúsculo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  CPF *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">Usado pelo atleta para entrar no app.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Classe *
                  </label>
                  <select
                    required
                    value={classe}
                    onChange={(e) => setClasse(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Categoria *
                  </label>
                  <select
                    required
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Celular / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value)}
                    placeholder="(31) 99999-9999"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Sexo
                  </label>
                  <select
                    value={sexo}
                    onChange={(e) => setSexo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                  </select>
                </div>
              </div>

              {editingAthlete && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400">
                    Atleta esqueceu a senha? Volte para a senha inicial.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors flex-shrink-0 disabled:opacity-50"
                  >
                    {resettingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                    Redefinir senha
                  </button>
                </div>
              )}

              {modalError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold shadow-lg shadow-sky-500/20 active:scale-95 transition-all flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingAthlete ? 'Salvar Alterações' : 'Cadastrar Atleta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
