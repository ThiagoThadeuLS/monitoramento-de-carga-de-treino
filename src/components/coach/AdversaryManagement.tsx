import React, { useMemo, useState } from 'react';
import { Shield, Plus, Loader2, Search, AlertCircle, Scale, ChevronRight, EyeOff } from 'lucide-react';
import { useDialogs } from '../ui/Dialogs';
import { useAdversaries } from './adversaries/useAdversaries';
import { AdversaryDetailSheet } from './adversaries/AdversaryDetailSheet';
import { AdversaryFormSheet } from './adversaries/AdversaryFormSheet';
import { AuthorBadge, OriginIcon } from './adversaries/ui';
import {
  Adversario,
  CLASSES,
  ClasseIdade,
  Draft,
  Sexo,
  TipoOrigem,
  chipCls,
  classeLabel,
  errMsg,
  initials,
  inputCls,
  newDraft,
} from './adversaries/types';

/**
 * Fichas de atletas adversários.
 * Treinador: usa as tabelas direto (regras por clube no banco).
 * Atleta (athleteToken): não tem login do Supabase; tudo passa pelas funções athlete_* do banco.
 */
export function AdversaryManagement({ readOnly = false, athleteToken }: { readOnly?: boolean; athleteToken?: string } = {}) {
  const { confirm, notify } = useDialogs();
  const data = useAdversaries(athleteToken);
  const { adversarios, observacoes, ocultos, currentUserId, loading, loadError, canEdit } = data;

  const [search, setSearch] = useState('');
  const [classe, setClasse] = useState<ClasseIdade | 'todas'>('todas');
  const [origem, setOrigem] = useState<TipoOrigem | 'todas'>('todas');
  const [showHidden, setShowHidden] = useState(false);
  const [open, setOpen] = useState<Adversario | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adversarios.filter(
      (a) =>
        ocultos.has(a.id) === showHidden &&
        (classe === 'todas' || a.classe_idade === classe) &&
        (origem === 'todas' || a.tipo_origem === origem) &&
        (!q || [a.nome, a.categoria_peso, a.origem_valor].some((v) => (v ?? '').toLowerCase().includes(q)))
    );
  }, [adversarios, search, classe, origem, ocultos, showHidden]);
  const hiddenCount = adversarios.filter((a) => ocultos.has(a.id)).length;
  const visibleCount = adversarios.length - hiddenCount;

  const closeDetail = () => {
    setOpen(null);
    setFormError('');
  };

  const startNew = () => {
    setFormError('');
    setEditing(newDraft());
  };

  const startEdit = (a: Adversario) => {
    if (!canEdit(a)) {
      notify('Você só pode editar fichas que você mesmo cadastrou.', 'error');
      return;
    }
    setFormError('');
    setOpen(null);
    const sexo: Sexo = a.sexo === 'feminino' ? 'feminino' : 'masculino';
    setEditing({ ...a, sexo });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.nome.trim() || !editing.categoria_peso.trim() || !editing.origem_valor.trim()) {
      setFormError('Preencha nome, categoria de peso e origem.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await data.save(editing);
      setEditing(null);
    } catch (err) {
      setFormError(errMsg(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Adversario) {
    if (!canEdit(a)) {
      notify('Você só tem permissão para excluir fichas de adversários que você mesmo cadastrou.', 'error');
      return;
    }
    setSaving(true);
    try {
      await data.remove(a);
      setOpen(null);
      notify(`Ficha de ${a.nome} excluída.`, 'success');
    } catch (err) {
      setFormError(errMsg(err, 'Não foi possível excluir.'));
    } finally {
      setSaving(false);
    }
  }

  async function addObservation(adversarioId: string, texto: string) {
    try {
      await data.addObservation(adversarioId, texto);
      return true;
    } catch (err) {
      notify(errMsg(err, 'Não foi possível adicionar a observação.'), 'error');
      return false;
    }
  }

  async function updateObservation(obsId: string, texto: string) {
    try {
      await data.updateObservation(obsId, texto);
      notify('Observação atualizada.', 'success');
      return true;
    } catch (err) {
      notify(errMsg(err, 'Não foi possível editar a observação.'), 'error');
      return false;
    }
  }

  async function deleteObservation(obsId: string) {
    if (!(await confirm({ message: 'Excluir esta observação?', danger: true }))) return;
    try {
      await data.deleteObservation(obsId);
    } catch (err) {
      notify(errMsg(err, 'Não foi possível excluir a observação.'), 'error');
    }
  }

  async function toggleHidden(a: Adversario) {
    const hide = !ocultos.has(a.id);
    if (
      hide &&
      !(await confirm({
        title: 'Apagar para mim',
        message: 'Apagar esta ficha só da sua lista?\n\nOs outros continuam vendo. Para trazer de volta, use "Apagados para mim".',
        confirmLabel: 'Apagar para mim',
      }))
    )
      return;
    setSaving(true);
    setFormError('');
    try {
      const next = await data.setHidden(a, hide);
      if (![...next].some((id) => adversarios.some((x) => x.id === id))) setShowHidden(false);
      setOpen(null);
    } catch (err) {
      setFormError(errMsg(err, 'Não foi possível concluir.'));
    } finally {
      setSaving(false);
    }
  }

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
              {visibleCount} cadastrado{visibleCount === 1 ? '' : 's'}
              {hiddenCount > 0 && (
                <span className="text-slate-500">
                  {' '}
                  • {hiddenCount} apagado{hiddenCount === 1 ? '' : 's'} para você
                </span>
              )}
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
            placeholder="Buscar por nome, categoria, clube ou país"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            <button type="button" className={chipCls(classe === 'todas')} onClick={() => setClasse('todas')}>
              Todas as classes
            </button>
            {CLASSES.map((c) => (
              <button key={c.id} type="button" className={chipCls(classe === c.id)} onClick={() => setClasse(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            <button type="button" className={chipCls(origem === 'todas')} onClick={() => setOrigem('todas')}>
              Todas
            </button>
            <button type="button" className={chipCls(origem === 'clube')} onClick={() => setOrigem('clube')}>
              Nacionais
            </button>
            <button type="button" className={chipCls(origem === 'pais')} onClick={() => setOrigem('pais')}>
              Internacionais
            </button>
          </div>
        </div>
        {(hiddenCount > 0 || showHidden) && (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className={`${chipCls(showHidden)} inline-flex items-center gap-1.5`}
            aria-pressed={showHidden}
          >
            <EyeOff className="w-3.5 h-3.5" /> {showHidden ? 'Voltar para a lista' : `Apagados para mim (${hiddenCount})`}
          </button>
        )}
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
            {showHidden
              ? 'Nenhum adversário apagado para você com esses filtros.'
              : visibleCount === 0
              ? hiddenCount > 0
                ? 'Você apagou todas as fichas da sua lista. Elas estão em "Apagados para mim".'
                : 'Nenhum adversário cadastrado ainda.'
              : 'Nenhum adversário encontrado com esses filtros.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold flex items-center gap-1">
                      <Scale className="w-3 h-3" /> {a.categoria_peso}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-semibold capitalize">
                      {a.sexo} • {classeLabel(a.classe_idade)}
                    </span>
                  </div>
                  <AuthorBadge tipo={a.criado_por_tipo} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <AdversaryDetailSheet
          key={open.id}
          adversario={open}
          observacoes={observacoes[open.id] ?? []}
          currentUserId={currentUserId}
          readOnly={readOnly}
          canEdit={canEdit(open)}
          hidden={ocultos.has(open.id)}
          saving={saving}
          error={formError}
          onClose={closeDetail}
          onEdit={() => startEdit(open)}
          onDelete={() => remove(open)}
          onToggleHidden={() => toggleHidden(open)}
          onAddObservation={(texto) => addObservation(open.id, texto)}
          onUpdateObservation={updateObservation}
          onDeleteObservation={deleteObservation}
        />
      )}

      {editing && (
        <AdversaryFormSheet
          draft={editing}
          onChange={setEditing}
          saving={saving}
          error={formError}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
