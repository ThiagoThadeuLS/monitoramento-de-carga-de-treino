import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import {
  DropTarget,
  TemplateBlock,
  TemplateItem,
  WorkoutTemplate,
  countItems,
  emptyBlock,
  emptyItem,
  insertItem,
  moveItem,
  nearestSlot,
  saveTemplate,
  stepBlock,
  stepItem,
  templateProblem,
} from '../../../lib/workoutTemplates';

export interface CatalogEntry {
  nome: string;
  exige_pr: boolean;
}

type DragPayload = { kind: 'item'; itemId: string; label: string } | { kind: 'novo'; exercicio: string; usaPr: boolean; label: string };

const input = 'bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white';

/**
 * Monta um modelo de ficha: blocos com exercícios do catálogo. Arrastar funciona com mouse e
 * com o dedo (pela alça ⋮⋮); as setas fazem o mesmo, para quem preferir no celular.
 */
export const WorkoutTemplateEditor: React.FC<{
  catalog: CatalogEntry[];
  initial: WorkoutTemplate;
  onSaved: (t: WorkoutTemplate) => void;
  onCancel: () => void;
}> = ({ catalog, initial, onSaved, onCancel }) => {
  const [nome, setNome] = useState(initial.nome);
  const [descricao, setDescricao] = useState(initial.descricao ?? '');
  const [blocos, setBlocos] = useState<TemplateBlock[]>(initial.blocos.length ? initial.blocos : [emptyBlock('Aquecimento'), emptyBlock('Principal')]);
  const [activeBlock, setActiveBlock] = useState<string>(blocos[blocos.length - 1]?.id ?? '');
  const [drag, setDrag] = useState<(DragPayload & { x: number; y: number }) | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const headerRefs = useRef(new Map<string, HTMLDivElement>());
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const setRef = (map: Map<string, HTMLDivElement>, id: string) => (el: HTMLDivElement | null) => {
    if (el) map.set(id, el);
    else map.delete(id);
  };

  const updateItem = (itemId: string, patch: Partial<TemplateItem>) =>
    setBlocos((bs) => bs.map((b) => ({ ...b, itens: b.itens.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) })));
  const removeItem = (itemId: string) => setBlocos((bs) => bs.map((b) => ({ ...b, itens: b.itens.filter((i) => i.id !== itemId) })));
  const renameBlock = (blockId: string, nomeBloco: string) => setBlocos((bs) => bs.map((b) => (b.id === blockId ? { ...b, nome: nomeBloco } : b)));
  const removeBlock = (blockId: string) => {
    setBlocos((bs) => bs.filter((b) => b.id !== blockId));
    if (activeBlock === blockId) setActiveBlock('');
  };
  const addBlock = () => {
    const b = emptyBlock();
    setBlocos((bs) => [...bs, b]);
    setActiveBlock(b.id);
  };

  /** Toque numa peça do catálogo: entra no fim do bloco marcado (ou do último) */
  const addToActive = (exercicio: string, usaPr: boolean) =>
    setBlocos((bs) => {
      const list = bs.length ? bs : [emptyBlock('Principal')];
      const b = list.find((x) => x.id === activeBlock) ?? list[list.length - 1];
      return insertItem(list, emptyItem(exercicio, usaPr), { blockId: b.id, index: b.itens.length });
    });

  /** Lugares onde dá para soltar: começo de cada bloco e depois de cada exercício */
  const targetAt = (y: number, draggedId?: string): DropTarget | null => {
    const slots: { target: DropTarget; y: number }[] = [];
    for (const b of blocos) {
      const h = headerRefs.current.get(b.id);
      if (!h) continue;
      slots.push({ target: { blockId: b.id, index: 0 }, y: h.getBoundingClientRect().bottom });
      let k = 0;
      for (const it of b.itens) {
        if (it.id === draggedId) continue;
        const el = itemRefs.current.get(it.id);
        if (!el) continue;
        k += 1;
        slots.push({ target: { blockId: b.id, index: k }, y: el.getBoundingClientRect().bottom });
      }
    }
    return nearestSlot(slots, y);
  };

  const startDrag = (e: React.PointerEvent, payload: DragPayload) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const draggedId = payload.kind === 'item' ? payload.itemId : undefined;
    // Peça do catálogo: só vira arrastar depois de mexer um pouco (toque = adicionar)
    let active = payload.kind === 'item';
    if (active) setDrag({ ...payload, x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        active = true;
      }
      setDrag({ ...payload, x: ev.clientX, y: ev.clientY });
      setTarget(targetAt(ev.clientY, draggedId));
      // Perto das bordas da tela, rola para alcançar blocos fora da vista
      if (ev.clientY < 70) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!active) {
        if (payload.kind === 'novo' && ev.type === 'pointerup') addToActive(payload.exercicio, payload.usaPr);
        return;
      }
      const t = ev.type === 'pointerup' ? targetAt(ev.clientY, draggedId) : null;
      if (t) {
        setBlocos((bs) => (payload.kind === 'item' ? moveItem(bs, payload.itemId, t) : insertItem(bs, emptyItem(payload.exercicio, payload.usaPr), t)));
        setActiveBlock(t.blockId);
      }
      setDrag(null);
      setTarget(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const save = async () => {
    const t: WorkoutTemplate = { id: initial.id, nome, descricao: descricao || null, blocos: blocos.filter((b) => b.itens.length > 0) };
    const problem = templateProblem(t);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await saveTemplate(t));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dropLine = <div className="h-1 rounded-full bg-sky-400 my-1" aria-hidden="true" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nome do modelo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Força A, Potência pré-competição" className={`w-full ${input} py-2`} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Descrição (opcional)</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} placeholder="Ex.: 2x por semana, fase de base" className={`w-full ${input} py-2`} />
        </label>
      </div>

      {/* Peças: exercícios do catálogo do clube */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2">
        <p className="text-[11px] text-slate-400">
          <strong className="text-slate-200">Catálogo:</strong> arraste o exercício até o bloco, ou toque para pôr no bloco marcado.
        </p>
        {catalog.length === 0 ? (
          <p className="text-xs text-amber-400">Cadastre exercícios no Catálogo Oficial para montar o modelo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((c) => (
              <button
                key={c.nome}
                type="button"
                onPointerDown={(e) => startDrag(e, { kind: 'novo', exercicio: c.nome, usaPr: c.exige_pr, label: c.nome })}
                className="touch-none select-none cursor-grab active:cursor-grabbing px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1"
              >
                <Plus className="w-3 h-3 text-sky-300" /> {c.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Blocos */}
      <div className="space-y-3">
        {blocos.map((b, bi) => {
          let k = 0;
          const marked = activeBlock === b.id;
          return (
            <div key={b.id} className={`rounded-2xl border p-3 ${marked ? 'border-sky-500/60 bg-sky-950/10' : 'border-slate-800 bg-slate-900/60'}`}>
              <div ref={setRef(headerRefs.current, b.id)} className="flex items-center gap-2 pb-2" onClick={() => setActiveBlock(b.id)}>
                <input
                  value={b.nome}
                  onChange={(e) => renameBlock(b.id, e.target.value)}
                  maxLength={60}
                  className={`flex-1 min-w-0 ${input} font-bold`}
                  aria-label="Nome do bloco"
                />
                <span className="text-[10px] text-slate-500 flex-shrink-0">{b.itens.length} exerc.</span>
                <button type="button" onClick={() => setBlocos((bs) => stepBlock(bs, b.id, -1))} disabled={bi === 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30" aria-label="Subir bloco">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setBlocos((bs) => stepBlock(bs, b.id, 1))} disabled={bi === blocos.length - 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30" aria-label="Descer bloco">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => removeBlock(b.id)} className="p-1.5 text-slate-500 hover:text-red-400" aria-label="Remover bloco" title="Remover bloco (e os exercícios dele)">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {drag && target?.blockId === b.id && target.index === 0 && dropLine}
              {b.itens.length === 0 && !(drag && target?.blockId === b.id) && (
                <p className="text-[11px] text-slate-500 border border-dashed border-slate-700 rounded-xl py-3 text-center">Solte um exercício aqui</p>
              )}

              <div className="space-y-1.5">
                {b.itens.map((it) => {
                  const dragging = drag?.kind === 'item' && drag.itemId === it.id;
                  if (!dragging) k += 1;
                  return (
                    <React.Fragment key={it.id}>
                      <div ref={setRef(itemRefs.current, it.id)} className={`bg-slate-950 border border-slate-800 rounded-xl p-2 ${dragging ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <span
                            onPointerDown={(e) => startDrag(e, { kind: 'item', itemId: it.id, label: it.exercicio })}
                            className="touch-none cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-white"
                            role="button"
                            aria-label={`Arrastar ${it.exercicio}`}
                          >
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <span className="flex-1 min-w-0 text-xs font-bold text-white truncate">{it.exercicio}</span>
                          <button type="button" onClick={() => setBlocos((bs) => stepItem(bs, it.id, -1))} className="p-1 text-slate-400 hover:text-white" aria-label="Subir">
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setBlocos((bs) => stepItem(bs, it.id, 1))} className="p-1 text-slate-400 hover:text-white" aria-label="Descer">
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => removeItem(it.id)} className="p-1 text-slate-500 hover:text-red-400" aria-label="Remover exercício">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-7 text-[11px] text-slate-400">
                          <label className="flex items-center gap-1">
                            Séries
                            <input type="number" min={1} max={50} value={it.series} onChange={(e) => updateItem(it.id, { series: Math.round(Number(e.target.value)) || 0 })} className={`w-14 ${input}`} />
                          </label>
                          <label className="flex items-center gap-1">
                            Reps
                            <input value={it.repeticoes} onChange={(e) => updateItem(it.id, { repeticoes: e.target.value })} maxLength={30} className={`w-20 ${input}`} />
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={it.usa_pr}
                              onChange={(e) => updateItem(it.id, { usa_pr: e.target.checked, porcentagem_pr: e.target.checked ? it.porcentagem_pr ?? 70 : null })}
                              className="w-3.5 h-3.5 accent-sky-500"
                            />
                            % PR
                          </label>
                          {it.usa_pr && (
                            <input
                              type="number"
                              min={1}
                              max={150}
                              value={it.porcentagem_pr ?? ''}
                              onChange={(e) => updateItem(it.id, { porcentagem_pr: e.target.value === '' ? null : Number(e.target.value) })}
                              className={`w-16 ${input}`}
                              aria-label="% do PR"
                            />
                          )}
                          <input
                            value={it.observacoes_tecnico ?? ''}
                            onChange={(e) => updateItem(it.id, { observacoes_tecnico: e.target.value || null })}
                            maxLength={200}
                            placeholder="Observação"
                            className={`flex-1 min-w-[8rem] ${input}`}
                          />
                        </div>
                      </div>
                      {drag && !dragging && target?.blockId === b.id && target.index === k && dropLine}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addBlock}
          className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Adicionar bloco
        </button>
      </div>

      {error && <p className="text-xs text-red-300 bg-red-950/50 border border-red-800 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar modelo ({countItems(blocos)} exerc.)
        </button>
      </div>

      {/* Peça seguindo o dedo/mouse */}
      {drag && (
        <div
          className="fixed z-[95] pointer-events-none px-3 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-black shadow-2xl"
          style={{ left: drag.x + 12, top: drag.y - 16 }}
        >
          {drag.label}
        </div>
      )}
    </div>
  );
};
