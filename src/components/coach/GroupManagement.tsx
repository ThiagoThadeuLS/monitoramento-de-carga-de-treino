import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, AlertCircle, CheckCircle2, X, Search, Pencil, Trash2, UsersRound } from 'lucide-react';
import { AthleteGroup, AthleteRef, deleteGroup, listActiveAthletes, listGroups, saveGroup } from '../../lib/groups';

interface EditingGroup {
  id?: string;
  nome: string;
  members: string[];
  previous: string[];
}

/** Gestão → Grupos: subgrupos de atletas do clube (um atleta pode estar em vários). */
export const GroupManagement: React.FC = () => {
  const [groups, setGroups] = useState<AthleteGroup[]>([]);
  const [athletes, setAthletes] = useState<AthleteRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState<EditingGroup | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [g, a] = await Promise.all([listGroups(), listActiveAthletes()]);
      setGroups(g);
      setAthletes(a);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const nameOf = useMemo(() => new Map(athletes.map((a) => [a.id, a.nome])), [athletes]);
  const filtered = athletes.filter((a) => a.nome.toLowerCase().includes(search.trim().toLowerCase()));

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 4000);
  };

  const open = (g?: AthleteGroup) => {
    // participantes inativos/removidos não aparecem para marcar; ficam fora ao salvar
    const members = (g?.members ?? []).filter((id) => nameOf.has(id));
    setEditing({ id: g?.id, nome: g?.nome ?? '', members, previous: g?.members ?? [] });
    setSearch('');
    setModalError('');
  };

  const toggle = (id: string) =>
    setEditing((e) => e && { ...e, members: e.members.includes(id) ? e.members.filter((m) => m !== id) : [...e.members, id] });

  const selectFiltered = (on: boolean) =>
    setEditing((e) => {
      if (!e) return e;
      const ids = filtered.map((a) => a.id);
      return { ...e, members: on ? Array.from(new Set([...e.members, ...ids])) : e.members.filter((m) => !ids.includes(m)) };
    });

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    if (!editing.nome.trim()) return setModalError('Dê um nome ao grupo.');
    setSaving(true);
    setModalError('');
    try {
      await saveGroup(editing, editing.previous);
      flash(editing.id ? `Grupo "${editing.nome.trim()}" atualizado.` : `Grupo "${editing.nome.trim()}" criado.`);
      setEditing(null);
      await load();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: AthleteGroup) => {
    if (!window.confirm(`Excluir o grupo "${g.nome}"? Os atletas continuam cadastrados; treinos destinados a este grupo deixam de considerá-lo.`)) return;
    try {
      await deleteGroup(g.id);
      flash(`Grupo "${g.nome}" excluído.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Grupos de atletas</p>
          <p className="text-xs text-slate-400">
            Separe o elenco em grupos para direcionar treinos no cronograma e filtrar as análises. Um atleta pode estar em vários grupos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Novo grupo
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl border bg-emerald-950/60 border-emerald-600 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="py-14 text-center text-slate-400 space-y-1 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <UsersRound className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">Nenhum grupo criado</p>
          <p className="text-xs">Ex.: "Pesados", "Leves", "Seleção estadual", "Retorno de lesão".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => {
            const members = g.members.filter((id) => nameOf.has(id));
            return (
              <article key={g.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{g.nome}</p>
                    <p className="text-xs text-slate-400">{members.length} atleta{members.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button type="button" onClick={() => open(g)} className="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30" title="Editar grupo">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(g)} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 border border-red-500/20" title="Excluir grupo">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.slice(0, 12).map((id) => (
                    <span key={id} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      {nameOf.get(id)}
                    </span>
                  ))}
                  {members.length > 12 && <span className="text-[11px] px-2 py-0.5 text-slate-500">+{members.length - 12}</span>}
                  {members.length === 0 && <span className="text-[11px] text-slate-500">Sem atletas.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <form onSubmit={handleSave} className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editing.id ? 'Editar grupo' : 'Novo grupo'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Nome do grupo *</span>
                <input
                  type="text"
                  maxLength={60}
                  value={editing.nome}
                  onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                  placeholder="ex: Pesados"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Atletas</span>
                  <span className="text-xs text-slate-400">{editing.members.length} selecionado{editing.members.length === 1 ? '' : 's'}</span>
                </div>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar atleta..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex gap-3 text-xs mb-2">
                  <button type="button" onClick={() => selectFiltered(true)} className="text-sky-300 hover:underline">Marcar {search ? 'resultado' : 'todos'}</button>
                  <button type="button" onClick={() => selectFiltered(false)} className="text-slate-400 hover:underline">Desmarcar {search ? 'resultado' : 'todos'}</button>
                </div>
                <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/70">
                  {filtered.map((a) => {
                    const on = editing.members.includes(a.id);
                    return (
                      <li key={a.id}>
                        <label className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm ${on ? 'bg-sky-500/10 text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="w-4 h-4 accent-sky-500" />
                          {a.nome}
                        </label>
                      </li>
                    );
                  })}
                  {filtered.length === 0 && <li className="px-3 py-4 text-xs text-slate-500">Nenhum atleta encontrado.</li>}
                </ul>
              </div>
              {modalError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{modalError}</span>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar grupo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
