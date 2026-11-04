import React, { useEffect, useState } from 'react';
import { Copy, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useDialogs } from '../../ui/Dialogs';
import { WorkoutTemplate, applyTemplate, countItems, deleteTemplate, listTemplates, newId } from '../../../lib/workoutTemplates';
import { CatalogEntry, WorkoutTemplateEditor } from './WorkoutTemplateEditor';

interface Props {
  catalog: CatalogEntry[];
  /** Treino escolhido na tela (para "Usar neste treino") */
  sessionId: string | null;
  sessionLabel?: string;
  /** Exercícios que a ficha do treino já tem e a última posição usada */
  fichaCount: number;
  lastPosition: number;
  /** Modelo para abrir no editor (ex.: "Salvar como modelo" de uma ficha pronta) */
  draft: WorkoutTemplate | null;
  onDraftHandled: () => void;
  /** A ficha do treino mudou: recarregar */
  onApplied: () => void;
  onClose: () => void;
}

/** Copia com ids novos (cada modelo tem os seus) */
const cloneBlocks = (t: WorkoutTemplate) => t.blocos.map((b) => ({ ...b, id: newId(), itens: b.itens.map((i) => ({ ...i, id: newId() })) }));

/** Modelos de ficha do clube: montar, editar e usar nos treinos do cronograma. */
export const WorkoutTemplateLibrary: React.FC<Props> = ({ catalog, sessionId, sessionLabel, fichaCount, lastPosition, draft, onDraftHandled, onApplied, onClose }) => {
  const { confirm, notify } = useDialogs();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((l) => !cancelled && setTemplates(l))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draft) return;
    setEditing(draft);
    onDraftHandled();
  }, [draft, onDraftHandled]);

  const saved = (t: WorkoutTemplate) => {
    setTemplates((list) => [...list.filter((x) => x.id !== t.id), t].sort((a, b) => a.nome.localeCompare(b.nome)));
    setEditing(null);
    notify(`Modelo "${t.nome}" salvo.`, 'success');
  };

  const remove = async (t: WorkoutTemplate) => {
    if (!t.id || !(await confirm({ message: `Excluir o modelo "${t.nome}"? Os treinos que já usaram ele não mudam.`, danger: true, confirmLabel: 'Excluir' }))) return;
    try {
      await deleteTemplate(t.id);
      setTemplates((list) => list.filter((x) => x.id !== t.id));
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const apply = async (t: WorkoutTemplate, mode: 'adicionar' | 'substituir') => {
    if (!sessionId) return;
    if (
      mode === 'substituir' &&
      !(await confirm({
        message: `Trocar os ${fichaCount} exercícios da ficha deste treino pelos ${countItems(t.blocos)} do modelo "${t.nome}"?`,
        danger: true,
        confirmLabel: 'Substituir',
      }))
    )
      return;
    setBusy(`${t.id}:${mode}`);
    try {
      await applyTemplate(t, sessionId, mode, lastPosition);
      notify(mode === 'substituir' ? 'Ficha substituída pelo modelo.' : 'Exercícios do modelo adicionados à ficha.', 'success');
      onApplied();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const btn = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 disabled:opacity-50';

  return (
    <div className="bg-slate-900/95 border border-violet-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-300" /> {editing ? (editing.id ? 'Editar modelo' : 'Novo modelo de ficha') : 'Modelos de ficha'}
          </h3>
          <p className="text-xs text-slate-400">
            {editing
              ? 'Monte os blocos e arraste os exercícios. Usar o modelo copia os exercícios para o treino.'
              : sessionLabel
              ? `Fichas prontas para reaproveitar. Treino escolhido: ${sessionLabel}`
              : 'Fichas prontas para reaproveitar nos treinos.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>

      {editing ? (
        <WorkoutTemplateEditor catalog={catalog} initial={editing} onSaved={saved} onCancel={() => setEditing(null)} />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing({ nome: '', descricao: null, blocos: [] })}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Novo modelo
          </button>

          {error && <p className="text-xs text-red-300">{error}</p>}
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-violet-300" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-xl">
              Nenhum modelo ainda. Crie um ou use "Salvar como modelo" numa ficha pronta.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  <div>
                    <p className="text-sm font-bold text-white">{t.nome}</p>
                    {t.descricao && <p className="text-[11px] text-slate-400">{t.descricao}</p>}
                    <p className="text-[11px] text-slate-500 mt-1">
                      {countItems(t.blocos)} exercícios · {t.blocos.map((b) => b.nome).join(' → ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sessionId &&
                      (fichaCount === 0 ? (
                        <button type="button" disabled={!!busy} onClick={() => apply(t, 'adicionar')} className={`${btn} bg-sky-500 text-slate-950 border-sky-500`}>
                          {busy === `${t.id}:adicionar` && <Loader2 className="w-3 h-3 animate-spin" />} Usar neste treino
                        </button>
                      ) : (
                        <>
                          <button type="button" disabled={!!busy} onClick={() => apply(t, 'adicionar')} className={`${btn} bg-sky-500 text-slate-950 border-sky-500`}>
                            {busy === `${t.id}:adicionar` && <Loader2 className="w-3 h-3 animate-spin" />} Adicionar à ficha
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => apply(t, 'substituir')} className={`${btn} bg-slate-900 text-amber-300 border-amber-500/40`}>
                            {busy === `${t.id}:substituir` && <Loader2 className="w-3 h-3 animate-spin" />} Substituir ficha
                          </button>
                        </>
                      ))}
                    <button type="button" onClick={() => setEditing(t)} className={`${btn} bg-slate-900 text-slate-300 border-slate-700`}>
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ nome: `${t.nome} (cópia)`.slice(0, 80), descricao: t.descricao, blocos: cloneBlocks(t) })}
                      className={`${btn} bg-slate-900 text-slate-300 border-slate-700`}
                    >
                      <Copy className="w-3 h-3" /> Duplicar
                    </button>
                    <button type="button" onClick={() => remove(t)} className={`${btn} bg-slate-900 text-red-300 border-red-500/30`} aria-label={`Excluir ${t.nome}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
