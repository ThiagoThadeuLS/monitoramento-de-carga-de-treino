import { describe, expect, it } from 'vitest';
import { clampSticker, coverRect, stickerHeight } from './trainingSticker';

describe('coverRect', () => {
  it('foto em pé (3:4) cobre o Story (9:16) cortando as laterais; 50% = centralizada', () => {
    const r = coverRect(3024, 4032, 1080, 1920, 50, 50);
    expect(r.h).toBeCloseTo(1920);
    expect(r.w).toBeCloseTo(1440);
    expect(r.x).toBeCloseTo(-180);
    expect(r.y).toBeCloseTo(0);
  });

  it('0% encosta na esquerda e 100% na direita (como o object-position do CSS)', () => {
    expect(coverRect(3024, 4032, 1080, 1920, 0, 50).x).toBeCloseTo(0);
    expect(coverRect(3024, 4032, 1080, 1920, 100, 50).x).toBeCloseTo(-360);
  });

  it('foto deitada (4:3) cobre a altura e corta mais dos lados', () => {
    const r = coverRect(4032, 3024, 1080, 1920, 50, 50);
    expect(r.h).toBeCloseTo(1920);
    expect(r.w).toBeCloseTo(2560);
  });
});

describe('clampSticker', () => {
  it('não deixa a figurinha sair do Story', () => {
    // largura 80% e altura = 0,7 da largura: metade da altura = 0,8 × 0,7 × 1080 / 1920 / 2
    const halfH = (0.8 * 0.7 * 1080) / 1920 / 2;
    expect(clampSticker(0, 0, 0.8, 0.7)).toEqual({ cx: 0.4, cy: halfH });
    const fim = clampSticker(1, 1, 0.8, 0.7);
    expect(fim.cx).toBeCloseTo(0.6);
    expect(fim.cy).toBeCloseTo(1 - halfH);
  });

  it('dentro do Story fica onde o atleta deixou', () => {
    expect(clampSticker(0.5, 0.5, 0.8, 0.7)).toEqual({ cx: 0.5, cy: 0.5 });
  });
});

describe('stickerHeight', () => {
  it('sem as notas a figurinha fica mais baixa', () => {
    expect(stickerHeight({ estilo: 'escuro', notas: false })).toBeLessThan(stickerHeight({ estilo: 'escuro', notas: true }));
  });
});
