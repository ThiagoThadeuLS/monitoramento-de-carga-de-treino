export const PLATES_AVAILABLE = [25, 20, 15, 10, 5, 2.5, 1] as const;
export type PlateWeight = (typeof PLATES_AVAILABLE)[number];

export interface PlateResult {
  plate: PlateWeight;
  qty: number;
}

export interface BarbellSetup {
  totalWeight: number;
  theoreticalWeight?: number;
  barWeight: number;
  weightPerSide: number;
  plates: PlateResult[]; // anilhas por lado
  remainder: number;
  exact: boolean;
}

const PLATE_COLORS: Record<PlateWeight, { bg: string; border: string; text: string; label: string }> = {
  25:  { bg: 'bg-red-600',    border: 'border-red-400',   text: 'text-white',     label: '25' },
  20:  { bg: 'bg-sky-600',    border: 'border-sky-400',   text: 'text-white',     label: '20' },
  15:  { bg: 'bg-yellow-500', border: 'border-yellow-300',text: 'text-slate-950', label: '15' },
  10:  { bg: 'bg-green-600',  border: 'border-green-400', text: 'text-white',     label: '10' },
  5:   { bg: 'bg-slate-100',  border: 'border-slate-300', text: 'text-slate-950', label: '5' },
  2.5: { bg: 'bg-slate-600',  border: 'border-slate-400', text: 'text-white',     label: '2,5' },
  1:   { bg: 'bg-zinc-800',   border: 'border-zinc-500',  text: 'text-zinc-200',  label: '1' },
};

export function getPlateColor(plate: PlateWeight) {
  return PLATE_COLORS[plate] ?? PLATE_COLORS[5];
}

/** Encontra a melhor combinação exata de anilhas para um lado usando {25, 20, 15, 10, 5, 2.5, 1} kg */
export function encontrarMontagemLado(pesoLado: number): PlateResult[] | null {
  const targetInt = Math.round(pesoLado * 10);
  if (targetInt < 0) return null;
  if (targetInt === 0) return [];

  let best: PlateResult[] | null = null;
  const plates = PLATES_AVAILABLE;

  // Busca 1: prioriza praticidade (no máximo 2 anilhas de 1 kg e 1 de 2.5 kg)
  function search(rem: number, pIdx: number, current: PlateResult[]) {
    if (rem === 0) {
      const count = current.reduce((sum, item) => sum + item.qty, 0);
      const bestCount = best ? best.reduce((sum, item) => sum + item.qty, 0) : Infinity;
      if (!best || count < bestCount) {
        best = current.map((i) => ({ ...i }));
      }
      return;
    }
    if (pIdx >= plates.length) return;

    const p = plates[pIdx];
    const pInt = Math.round(p * 10);
    let maxQ = Math.floor(rem / pInt);

    if (p === 1 && maxQ > 2) maxQ = 2;
    if (p === 2.5 && maxQ > 1) maxQ = 1;

    for (let q = maxQ; q >= 0; q--) {
      if (q > 0) current.push({ plate: p, qty: q });
      search(rem - q * pInt, pIdx + 1, current);
      if (q > 0) current.pop();
    }
  }

  search(targetInt, 0, []);

  // Busca 2 (fallback relaxado): se necessário, aceita até 4 anilhas de 1 kg ou 2 de 2.5 kg
  if (!best) {
    function searchLoose(rem: number, pIdx: number, current: PlateResult[]) {
      if (rem === 0) {
        const count = current.reduce((sum, item) => sum + item.qty, 0);
        const bestCount = best ? best.reduce((sum, item) => sum + item.qty, 0) : Infinity;
        if (!best || count < bestCount) {
          best = current.map((i) => ({ ...i }));
        }
        return;
      }
      if (pIdx >= plates.length) return;

      const p = plates[pIdx];
      const pInt = Math.round(p * 10);
      let maxQ = Math.floor(rem / pInt);
      if (p === 1 && maxQ > 4) maxQ = 4;
      if (p === 2.5 && maxQ > 2) maxQ = 2;

      for (let q = maxQ; q >= 0; q--) {
        if (q > 0) current.push({ plate: p, qty: q });
        searchLoose(rem - q * pInt, pIdx + 1, current);
        if (q > 0) current.pop();
      }
    }
    searchLoose(targetInt, 0, []);
  }

  return best;
}

/**
 * Encontra o peso total montável mais próximo para uma barra de 20 kg
 * usando anilhas de 25, 20, 15, 10, 5, 2.5 e 1 kg.
 */
export function ajustarCargaMontavel(pesoAlvo: number, pesoBarra: number = 20): {
  pesoAjustado: number;
  pesoLado: number;
  plates: PlateResult[];
} {
  if (pesoAlvo <= pesoBarra) {
    return { pesoAjustado: pesoBarra, pesoLado: 0, plates: [] };
  }

  // Gera candidatos ordenados por proximidade do pesoAlvo
  const base = Math.round(pesoAlvo);
  const candidatos: number[] = [];
  for (let offset = 0; offset <= 30; offset++) {
    if (offset === 0) {
      if (base >= pesoBarra) candidatos.push(base);
    } else {
      if (base + offset >= pesoBarra) candidatos.push(base + offset);
      if (base - offset >= pesoBarra) candidatos.push(base - offset);
    }
  }

  candidatos.sort((a, b) => Math.abs(a - pesoAlvo) - Math.abs(b - pesoAlvo));

  for (const cand of candidatos) {
    const side = (cand - pesoBarra) / 2;
    if (side < 0) continue;
    const plates = encontrarMontagemLado(side);
    if (plates !== null) {
      return {
        pesoAjustado: cand,
        pesoLado: side,
        plates,
      };
    }
  }

  // Fallback seguro
  return {
    pesoAjustado: Math.round(pesoAlvo),
    pesoLado: Math.max(0, (Math.round(pesoAlvo) - pesoBarra) / 2),
    plates: [],
  };
}

/** Montagem da barra para o componente visual e textual */
export function calcularMontagemBarra(pesoTotalAlvo: number, pesoBarra: number = 20): BarbellSetup {
  const { pesoAjustado, pesoLado, plates } = ajustarCargaMontavel(pesoTotalAlvo, pesoBarra);

  return {
    totalWeight: pesoAjustado,
    theoreticalWeight: pesoTotalAlvo !== pesoAjustado ? pesoTotalAlvo : undefined,
    barWeight: pesoBarra,
    weightPerSide: pesoLado,
    plates,
    remainder: 0,
    exact: true,
  };
}

export function calcularAnilhasPorLado(pesoTotalAlvo: number, pesoBarra: number = 20): string {
  if (pesoTotalAlvo <= pesoBarra) return 'Apenas a barra (20 kg)';
  const setup = calcularMontagemBarra(pesoTotalAlvo, pesoBarra);
  if (setup.plates.length === 0) return 'Apenas a barra (20 kg)';

  const partes = setup.plates.map((p) => `${p.qty > 1 ? `${p.qty}× ` : ''}${p.plate} kg`);
  return `${partes.join(' + ')} de cada lado (${setup.totalWeight} kg total)`;
}
