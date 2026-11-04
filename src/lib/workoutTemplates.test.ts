import { describe, expect, it } from 'vitest';
import {
  TemplateBlock,
  emptyItem,
  insertItem,
  moveItem,
  nearestSlot,
  rowsToBlocks,
  stepBlock,
  stepItem,
  templateProblem,
  templateToRows,
} from './workoutTemplates';

const item = (id: string, exercicio = id) => ({ ...emptyItem(exercicio, true), id });
const blocks = (): TemplateBlock[] => [
  { id: 'A', nome: 'Aquecimento', itens: [item('a1'), item('a2')] },
  { id: 'B', nome: 'Força', itens: [item('b1'), item('b2'), item('b3')] },
];
const ids = (bs: TemplateBlock[]) => bs.map((b) => `${b.id}:${b.itens.map((i) => i.id).join(',')}`).join(' | ');

describe('mover exercícios', () => {
  it('arrasta para outro bloco, na posição escolhida', () => {
    expect(ids(moveItem(blocks(), 'a1', { blockId: 'B', index: 1 }))).toBe('A:a2 | B:b1,a1,b2,b3');
  });

  it('no mesmo bloco, o índice é contado sem o próprio exercício', () => {
    expect(ids(moveItem(blocks(), 'b1', { blockId: 'B', index: 2 }))).toBe('A:a1,a2 | B:b2,b3,b1');
  });

  it('exercício novo do catálogo entra no lugar solto', () => {
    expect(ids(insertItem(blocks(), item('novo'), { blockId: 'A', index: 0 }))).toBe('A:novo,a1,a2 | B:b1,b2,b3');
  });

  it('subir/descer: na ponta do bloco passa para o vizinho; nas pontas da ficha não faz nada', () => {
    expect(ids(stepItem(blocks(), 'b1', -1))).toBe('A:a1,a2,b1 | B:b2,b3');
    expect(ids(stepItem(blocks(), 'a2', 1))).toBe('A:a1 | B:a2,b1,b2,b3');
    expect(ids(stepItem(blocks(), 'a1', -1))).toBe(ids(blocks()));
    expect(ids(stepBlock(blocks(), 'B', -1))).toBe('B:b1,b2,b3 | A:a1,a2');
  });

  it('escolhe o lugar mais perto do dedo/mouse', () => {
    const slots = [
      { target: { blockId: 'A', index: 0 }, y: 100 },
      { target: { blockId: 'A', index: 1 }, y: 160 },
      { target: { blockId: 'B', index: 0 }, y: 240 },
    ];
    expect(nearestSlot(slots, 150)).toEqual({ blockId: 'A', index: 1 });
    expect(nearestSlot(slots, 230)).toEqual({ blockId: 'B', index: 0 });
    expect(nearestSlot([], 10)).toBeNull();
  });
});

describe('modelo <-> ficha do treino', () => {
  it('vira linhas da ficha na ordem dos blocos, com o nome do bloco', () => {
    const rows = templateToRows({ blocos: blocks() });
    expect(rows.map((r) => `${r.bloco}/${r.exercicio}`)).toEqual([
      'Aquecimento/a1',
      'Aquecimento/a2',
      'Força/b1',
      'Força/b2',
      'Força/b3',
    ]);
  });

  it('sem % do PR, a porcentagem não vai para a ficha', () => {
    const b: TemplateBlock[] = [{ id: 'A', nome: 'Core', itens: [{ ...item('p'), usa_pr: false, porcentagem_pr: 70 }] }];
    expect(templateToRows({ blocos: b })[0].porcentagem_pr).toBeNull();
  });

  it('ficha montada vira modelo: exercícios seguidos do mesmo bloco ficam juntos', () => {
    const rows = templateToRows({ blocos: blocks() });
    const back = rowsToBlocks(rows);
    expect(back.map((b) => `${b.nome}:${b.itens.map((i) => i.exercicio).join(',')}`)).toEqual(['Aquecimento:a1,a2', 'Força:b1,b2,b3']);
  });
});

describe('templateProblem', () => {
  it('pede nome e pelo menos um exercício', () => {
    expect(templateProblem({ nome: ' ', descricao: null, blocos: blocks() })).toMatch(/nome/);
    expect(templateProblem({ nome: 'Força A', descricao: null, blocos: [{ id: 'A', nome: 'X', itens: [] }] })).toMatch(/exercício/);
    expect(templateProblem({ nome: 'Força A', descricao: null, blocos: blocks() })).toBeNull();
  });

  it('séries e % do PR dentro das regras da ficha', () => {
    const b = blocks();
    b[0].itens[0].series = 0;
    expect(templateProblem({ nome: 'X', descricao: null, blocos: b })).toMatch(/séries/);
    const c = blocks();
    c[0].itens[0].porcentagem_pr = 200;
    expect(templateProblem({ nome: 'X', descricao: null, blocos: c })).toMatch(/PR/);
  });
});
