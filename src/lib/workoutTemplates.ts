// Modelos de ficha da preparação física: blocos com exercícios, montados uma vez e
// reaproveitados em vários treinos. Usar um modelo COPIA os exercícios para o treino:
// editar o modelo depois não muda os treinos que já o usaram.
import { deleteById, supabase } from './supabase';

export interface TemplateItem {
  /** Chave só para a tela (arrastar, editar) */
  id: string;
  exercicio: string;
  series: number;
  repeticoes: string;
  usa_pr: boolean;
  porcentagem_pr: number | null;
  observacoes_tecnico: string | null;
}

export interface TemplateBlock {
  id: string;
  nome: string;
  itens: TemplateItem[];
}

export interface WorkoutTemplate {
  id?: string;
  nome: string;
  descricao: string | null;
  blocos: TemplateBlock[];
  updated_at?: string;
}

/** Exercício como fica gravado na ficha do treino */
export interface PrescriptionRow {
  bloco: string;
  exercicio: string;
  series: number;
  repeticoes: string;
  usa_pr: boolean;
  porcentagem_pr: number | null;
  observacoes_tecnico: string | null;
}

/** Onde soltar: no bloco tal, na posição tal (0 = no começo) */
export interface DropTarget {
  blockId: string;
  index: number;
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const emptyItem = (exercicio: string, usaPr: boolean): TemplateItem => ({
  id: newId(),
  exercicio,
  series: 3,
  repeticoes: '8-10',
  usa_pr: usaPr,
  porcentagem_pr: usaPr ? 70 : null,
  observacoes_tecnico: null,
});

export const emptyBlock = (nome = 'Novo bloco'): TemplateBlock => ({ id: newId(), nome, itens: [] });

export const countItems = (blocks: TemplateBlock[]) => blocks.reduce((s, b) => s + b.itens.length, 0);

// ---------- Mover (contas puras: a tela só chama) ----------

/** Põe um exercício novo no lugar indicado */
export function insertItem(blocks: TemplateBlock[], item: TemplateItem, target: DropTarget): TemplateBlock[] {
  return blocks.map((b) => {
    if (b.id !== target.blockId) return b;
    const itens = [...b.itens];
    itens.splice(Math.max(0, Math.min(target.index, itens.length)), 0, item);
    return { ...b, itens };
  });
}

/**
 * Move um exercício para o lugar indicado (no mesmo bloco ou em outro). O índice é contado
 * sem o próprio exercício (como a tela mostra a linha de "soltar aqui").
 */
export function moveItem(blocks: TemplateBlock[], itemId: string, target: DropTarget): TemplateBlock[] {
  const item = blocks.flatMap((b) => b.itens).find((i) => i.id === itemId);
  if (!item) return blocks;
  const without = blocks.map((b) => ({ ...b, itens: b.itens.filter((i) => i.id !== itemId) }));
  return insertItem(without, item, target);
}

/** Sobe (-1) ou desce (+1) um exercício; no começo/fim do bloco, passa para o bloco vizinho */
export function stepItem(blocks: TemplateBlock[], itemId: string, delta: -1 | 1): TemplateBlock[] {
  const bi = blocks.findIndex((b) => b.itens.some((i) => i.id === itemId));
  if (bi < 0) return blocks;
  const ii = blocks[bi].itens.findIndex((i) => i.id === itemId);
  const next = ii + delta;
  if (next >= 0 && next < blocks[bi].itens.length) return moveItem(blocks, itemId, { blockId: blocks[bi].id, index: next });
  const nb = bi + delta;
  if (nb < 0 || nb >= blocks.length) return blocks;
  return moveItem(blocks, itemId, { blockId: blocks[nb].id, index: delta < 0 ? blocks[nb].itens.length : 0 });
}

/** Sobe (-1) ou desce (+1) um bloco inteiro */
export function stepBlock(blocks: TemplateBlock[], blockId: string, delta: -1 | 1): TemplateBlock[] {
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const out = [...blocks];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Lugar mais perto do ponteiro. `slots` = posições possíveis na tela (y da linha de soltar),
 * na ordem: começo de cada bloco e depois de cada exercício.
 */
export function nearestSlot(slots: { target: DropTarget; y: number }[], y: number): DropTarget | null {
  let best: { target: DropTarget; d: number } | null = null;
  for (const s of slots) {
    const d = Math.abs(s.y - y);
    if (!best || d < best.d) best = { target: s.target, d };
  }
  return best?.target ?? null;
}

// ---------- Modelo <-> ficha do treino ----------

/** Exercícios do modelo como linhas da ficha (na ordem dos blocos) */
export function templateToRows(t: Pick<WorkoutTemplate, 'blocos'>): PrescriptionRow[] {
  return t.blocos.flatMap((b) =>
    b.itens.map((i) => ({
      bloco: b.nome.trim() || 'Principal',
      exercicio: i.exercicio.trim(),
      series: i.series,
      repeticoes: i.repeticoes.trim(),
      usa_pr: i.usa_pr,
      porcentagem_pr: i.usa_pr ? i.porcentagem_pr : null,
      observacoes_tecnico: i.observacoes_tecnico?.trim() || null,
    }))
  );
}

/** Ficha já montada num treino vira blocos (exercícios seguidos do mesmo bloco ficam juntos) */
export function rowsToBlocks(rows: PrescriptionRow[]): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  for (const r of rows) {
    let last = blocks[blocks.length - 1];
    if (!last || last.nome !== r.bloco) {
      last = emptyBlock(r.bloco);
      blocks.push(last);
    }
    last.itens.push({
      id: newId(),
      exercicio: r.exercicio,
      series: Number(r.series) || 1,
      repeticoes: r.repeticoes ?? '',
      usa_pr: !!r.usa_pr,
      porcentagem_pr: r.usa_pr ? Number(r.porcentagem_pr) || null : null,
      observacoes_tecnico: r.observacoes_tecnico ?? null,
    });
  }
  return blocks;
}

/** O que impede salvar (mesmas regras que o banco aplica na ficha do treino) */
export function templateProblem(t: WorkoutTemplate): string | null {
  const nome = t.nome.trim();
  if (!nome) return 'Dê um nome ao modelo.';
  if (nome.length > 80) return 'O nome pode ter até 80 caracteres.';
  if ((t.descricao ?? '').length > 300) return 'A descrição pode ter até 300 caracteres.';
  if (countItems(t.blocos) === 0) return 'Coloque pelo menos um exercício.';
  for (const b of t.blocos) {
    for (const i of b.itens) {
      if (!Number.isInteger(i.series) || i.series < 1 || i.series > 50) return `${i.exercicio}: séries de 1 a 50.`;
      if (i.usa_pr && (!i.porcentagem_pr || i.porcentagem_pr < 1 || i.porcentagem_pr > 150)) return `${i.exercicio}: % do PR de 1 a 150.`;
    }
  }
  return null;
}

// ---------- Banco (treinador; o RLS limita ao clube) ----------

function templateError(err: { message?: string } | null): string {
  const msg = err?.message ?? '';
  if (/workout_templates_nome_unico|duplicate key/.test(msg)) return 'Já existe um modelo com esse nome.';
  if (/workout_templates/.test(msg) && /(does not exist|Could not find|schema cache)/.test(msg))
    return 'Os modelos de ficha ainda não foram ativados no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/row-level security/.test(msg)) return 'Sem permissão para alterar (modo somente leitura?).';
  return `Erro: ${msg}`;
}

export async function listTemplates(): Promise<WorkoutTemplate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('workout_templates').select('id, nome, descricao, blocos, updated_at').order('nome');
  if (error) throw new Error(templateError(error));
  return (data ?? []) as WorkoutTemplate[];
}

export async function saveTemplate(t: WorkoutTemplate): Promise<WorkoutTemplate> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const problem = templateProblem(t);
  if (problem) throw new Error(problem);
  const payload = { nome: t.nome.trim(), descricao: t.descricao?.trim() || null, blocos: t.blocos, updated_at: new Date().toISOString() };
  const query = t.id
    ? supabase.from('workout_templates').update(payload).eq('id', t.id).select('id, nome, descricao, blocos, updated_at').single()
    : supabase.from('workout_templates').insert([payload]).select('id, nome, descricao, blocos, updated_at').single();
  const { data, error } = await query;
  if (error || !data) throw new Error(templateError(error));
  return data as WorkoutTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteById('workout_templates', id);
}

/**
 * Copia o modelo para a ficha do treino: no fim da ficha ou no lugar dela (substituir).
 * Devolve os exercícios gravados.
 */
export async function applyTemplate(t: WorkoutTemplate, sessionId: string, mode: 'adicionar' | 'substituir', lastPosition: number) {
  if (!supabase) throw new Error('Supabase não configurado.');
  if (mode === 'substituir') {
    const { error } = await supabase.from('workout_prescriptions').delete().eq('training_session_id', sessionId);
    if (error) throw new Error(templateError(error));
  }
  const start = mode === 'substituir' ? 0 : lastPosition;
  const rows = templateToRows(t).map((r, i) => ({ ...r, training_session_id: sessionId, posicao: start + i + 1 }));
  const { data, error } = await supabase.from('workout_prescriptions').insert(rows).select();
  if (error) throw new Error(templateError(error));
  return data ?? [];
}
