export const PLATES_AVAILABLE = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export type PlateWeight = (typeof PLATES_AVAILABLE)[number];

export interface PlateResult {
  plate: PlateWeight;
  qty: number;
}

export interface BarbellSetup {
  totalWeight: number;
  barWeight: number;
  weightPerSide: number;
  plates: PlateResult[];  // plates per side
  remainder: number;       // kg that couldn't be made with available plates
  exact: boolean;
}

const PLATE_COLORS: Record<PlateWeight, { bg: string; border: string; text: string; label: string }> = {
  25:   { bg: 'bg-red-600',     border: 'border-red-400',    text: 'text-white',        label: '25' },
  20:   { bg: 'bg-sky-600',     border: 'border-sky-400',    text: 'text-white',        label: '20' },
  15:   { bg: 'bg-yellow-500',  border: 'border-yellow-300', text: 'text-slate-950',    label: '15' },
  10:   { bg: 'bg-green-600',   border: 'border-green-400',  text: 'text-white',        label: '10' },
  5:    { bg: 'bg-slate-100',   border: 'border-slate-300',  text: 'text-slate-950',    label:  '5' },
  2.5:  { bg: 'bg-slate-600',   border: 'border-slate-400',  text: 'text-white',        label: '2,5' },
  1.25: { bg: 'bg-amber-300',   border: 'border-amber-400',  text: 'text-slate-950',    label: '1,25' },
};

export function getPlateColor(plate: PlateWeight) {
  return PLATE_COLORS[plate] ?? PLATE_COLORS[5];
}

export function calcularAnilhasPorLado(pesoTotalAlvo: number, pesoBarra: number = 20): string {
  if (pesoTotalAlvo <= pesoBarra) return 'Apenas a barra (20 kg)';
  const pesoNecessarioPorLado = (pesoTotalAlvo - pesoBarra) / 2;
  const anilhasDisponiveis = [25, 20, 15, 10, 5, 2.5, 1];
  let resto = Math.round(pesoNecessarioPorLado * 100) / 100;
  const resultado: string[] = [];
  for (const anilha of anilhasDisponiveis) {
    const qtd = Math.floor(resto / anilha);
    if (qtd > 0) {
      resultado.push(`${qtd}× ${anilha} kg`);
      resto = Math.round((resto % anilha) * 100) / 100;
    }
  }
  return resultado.length > 0 ? resultado.join(' + ') + ' de cada lado' : 'Apenas a barra';
}

/** Detailed breakdown for the visual plate display. */
export function calcularMontagemBarra(pesoTotalAlvo: number, pesoBarra: number = 20): BarbellSetup {
  const weightPerSide = Math.max(0, (pesoTotalAlvo - pesoBarra) / 2);
  let resto = Math.round(weightPerSide * 1000) / 1000;
  const plates: PlateResult[] = [];

  for (const plate of PLATES_AVAILABLE) {
    const qty = Math.floor(Math.round(resto / plate * 100) / 100);
    if (qty > 0) {
      plates.push({ plate, qty });
      resto = Math.round((resto - qty * plate) * 1000) / 1000;
    }
  }

  return {
    totalWeight: pesoTotalAlvo,
    barWeight: pesoBarra,
    weightPerSide,
    plates,
    remainder: Math.round(resto * 1000) / 1000,
    exact: resto < 0.001,
  };
}
