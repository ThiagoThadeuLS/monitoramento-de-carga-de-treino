import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Shield, Plus, Edit2, Trash2, Loader2, X, Search, Globe2, Building2, StickyNote, AlertCircle, Scale, ChevronRight,
} from 'lucide-react';

type ClasseIdade = 'juvenil' | 'júnior' | 'sênior';
type TipoOrigem = 'pais' | 'clube';

interface Adversario {
  id: string;
  nome: string;
  categoria_peso: string;
  classe_idade: ClasseIdade;
  tipo_origem: TipoOrigem;
  origem_valor: string;
  observacao?: string | null;
}

type Draft = Omit<Adversario, 'id'> & { id?: string };

const CLASSES: { id: ClasseIdade; label: string }[] = [
  { id: 'juvenil', label: 'Juvenil' },
  { id: 'júnior', label: 'Júnior' },
  { id: 'sênior', label: 'Sênior' },
];
const EMPTY: Draft = { nome: '', categoria_peso: '', classe_idade: 'sênior', tipo_origem: 'clube', origem_valor: '', observacao: '' };

const initials = (nome: string) =>
  nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const classeLabel = (c: ClasseIdade) => CLASSES.find((x) => x.id === c)?.label ?? c;

const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500';

/** Atletas adversários do clube. readOnly: modo suporte (Área Restrita) — só visualiza. */
export function AdversaryManagement({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [adversarios, setAdversarios] = useState<Adversario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classe, setClasse] = useState<ClasseIdade | 'todas'>('todas');
  const [origem, setOrigem] = useState<TipoOrigem | 'todas'>('todas');
  const [open, setOpen] = useState<Adversario | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return setLoading(false);
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.from('adversarios').select('*').order('nome');
    if (error) setLoadError('Não foi possível carregar os adversários.');
    else setAdversarios((data ?? []) as Adversario[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adversarios.filter(
      (a) =>
        (classe === 'todas' || a.classe_idade === classe) &&
        (origem === 'todas' || a.tipo_origem === origem) &&
        (!q || [a.nome, a.categoria_peso, a.origem_valor, a.observacao ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [adversarios, search, classe, origem]);

  const startNew = () => {
    setFormError('');
    setEditing({ ...EMPTY });
  };
  const startEdit = (a: Adversario) => {
    setFormError('');
    setOpen(null);
    setEditing({ ...a, observacao: a.observacao ?? '' });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !editing) return;
    if (!editing.nome.trim() || !editing.categoria_peso.trim() || !editing.origem_valor.trim()) {
      setFormError('Preencha nome, categoria de peso e origem.');
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = {
      nome: editing.nome.trim(),
      categoria_peso: editing.categoria_peso.trim(),
      classe_idade: editing.classe_idade,
      tipo_origem: editing.tipo_origem,
      origem_valor: editing.origem_valor.trim(),
      observacao: editing.observacao?.trim() || null,
    };
    const { error } = editing.id
      ? await supabase.from('adversarios').update(payload).eq('id', editing.id)
      : await supabase.from('adversarios').insert([payload]);
    setSaving(false);
    if (error) {
      setFormError(/row-level security/.test(error.message) ? 'Sem permissão para alterar (modo somente leitura?).' : 'Não foi possível salvar. Tente novamente.');
      return;
    }
    setEditing(null);
    load();
  }

  async function remove(a: Adversario) {
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from('adversarios').delete().eq('id', a.id);
    setSaving(false);
    setConfirmDelete(false);
    if (error) return setFormError('Não foi possível excluir.');
    setOpen(null);
    load();
  }

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap ${
      on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
    }`;

  const OriginIcon = ({ tipo, className }: { tipo: TipoOrigem; className?: string }) =>
    tipo === 'pais' ? <Globe2 className={className} /> : <Building2 className={className} />;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Atletas adversários</h2>
            <p className="text-xs text-slate-400">
              {adversarios.length} cadastrado{adversarios.length === 1 ? '' : 's'} • {adversarios.filter((a) => a.tipo_origem === 'pais').length} internacionais
            </p>
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={startNew}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20"
          >
            <Plus className="w-4 h-4" /> Novo adversário
          </button>
        )}
      </div>

      {/* Busca e filtros */}
      <div className="bg-slate-900/80 border border-slate-800 p-3 sm:p-4 rounded-2xl space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, categoria, clube, país ou observação"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Classe de idade">
            <button type="button" className={chip(classe === 'todas')} onClick={() => setClasse('todas')}>Todas as classes</button>
            {CLASSES.map((c) => (
              <button key={c.id} type="button" className={chip(classe === c.id)} onClick={() => setClasse(c.id)}>{c.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Origem">
            <button type="button" className={chip(origem === 'todas')} onClick={() => setOrigem('todas')}>Todas</button>
            <button type="button" className={chip(origem === 'clube')} onClick={() => setOrigem('clube')}>Nacionais</button>
            <button type="button" className={chip(origem === 'pais')} onClick={() => setOrigem('pais')}>Internacionais</button>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : loadError ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl space-y-2">
          <Shield className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">
            {adversarios.length === 0 ? 'Nenhum adversário cadastrado ainda.' : 'Nenhum adversário encontrado com esses filtros.'}
          </p>
          {adversarios.length === 0 && !readOnly && (
            <button type="button" onClick={startNew} className="text-xs font-bold text-sky-400 hover:text-sky-300">
              Cadastrar o primeiro
            </button>
          )}
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpen(a)}
                className="w-full h-full text-left bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-4 transition-colors flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-black text-sky-300 flex-shrink-0">
                    {initials(a.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white truncate">{a.nome}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                      <OriginIcon tipo={a.tipo_origem} className="w-3.5 h-3.5 flex-shrink-0" />
                      {a.origem_valor}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold flex items-center gap-1">
                    <Scale className="w-3 h-3" /> {a.categoria_peso}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                    {classeLabel(a.classe_idade)}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                    {a.tipo_origem === 'pais' ? 'Internacional' : 'Nacional'}
                  </span>
                </div>
                {a.observacao && (
                  <p className="text-xs text-slate-400 line-clamp-2 flex items-start gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-500" />
                    {a.observacao}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Detalhes */}
      {open && (
        <Sheet onClose={() => { setOpen(null); setConfirmDelete(false); }} label={open.nome}>
          <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sky-300 flex-shrink-0">
              {initials(open.nome)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white break-words">{open.nome}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <OriginIcon tipo={open.tipo_origem} className="w-3.5 h-3.5" />
                {open.origem_valor} • {open.tipo_origem === 'pais' ? 'Internacional' : 'Nacional'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Categoria de peso" value={open.categoria_peso} />
              <Info label="Classe de idade" value={classeLabel(open.classe_idade)} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                <StickyNote className="w-3.5 h-3.5" /> Observações
              </p>
              {open.observacao ? (
                <p className="text-sm text-slate-200 whitespace-pre-wrap break-words bg-slate-950 border border-slate-800 rounded-xl p-3">{open.observacao}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">Sem observações.</p>
              )}
            </div>
            {formError && <p className="text-xs text-red-300">{formError}</p>}
          </div>
          {!readOnly && (
            <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
              {confirmDelete ? (
                <>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(open)}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Confirmar exclusão
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(open)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                </>
              )}
            </div>
          )}
        </Sheet>
      )}

      {/* Cadastro / edição */}
      {editing && (
        <Sheet onClose={() => setEditing(null)} label={editing.id ? 'Editar adversário' : 'Novo adversário'}>
          <form onSubmit={save} className="flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editing.id ? 'Editar adversário' : 'Novo adversário'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <Field label="Nome do atleta">
                <input className={inputCls} value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Nome completo" autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria de peso">
                  <input className={inputCls} value={editing.categoria_peso} onChange={(e) => setEditing({ ...editing, categoria_peso: e.target.value })} placeholder="Ex.: -73kg" />
                </Field>
                <Field label="Classe de idade">
                  <select className={inputCls} value={editing.classe_idade} onChange={(e) => setEditing({ ...editing, classe_idade: e.target.value as ClasseIdade })}>
                    {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Origem">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(['clube', 'pais'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditing({ ...editing, tipo_origem: t })}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border ${
                        editing.tipo_origem === t ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <OriginIcon tipo={t} className="w-4 h-4" /> {t === 'clube' ? 'Clube (nacional)' : 'País (internacional)'}
                    </button>
                  ))}
                </div>
                <input
                  className={inputCls}
                  value={editing.origem_valor}
                  onChange={(e) => setEditing({ ...editing, origem_valor: e.target.value })}
                  placeholder={editing.tipo_origem === 'pais' ? 'Ex.: França, Japão...' : 'Ex.: Flamengo, Pinheiros...'}
                />
              </Field>
              <Field label="Observações">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={4}
                  value={editing.observacao ?? ''}
                  onChange={(e) => setEditing({ ...editing, observacao: e.target.value })}
                  placeholder="Pontos fortes, estilo de luta, pegada, histórico de confrontos..."
                />
              </Field>
              {formError && <p className="text-xs text-red-300">{formError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editing.id ? 'Salvar alterações' : 'Cadastrar adversário'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

const Sheet: React.FC<{ onClose: () => void; label: string; children: React.ReactNode }> = ({ onClose, label, children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">{label}</span>
    {children}
  </label>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p className="text-sm font-bold text-white mt-0.5">{value}</p>
  </div>
);
