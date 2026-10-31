export type StatKey = 'mean' | 'median' | 'mode';

export const STATS: { key: StatKey; label: string; color: string; shape: 'circle' | 'square' | 'diamond' }[] = [
  // Cores validadas para o fundo escuro (contraste e daltonismo); a cor segue a estatística nos dois gráficos
  { key: 'mean', label: 'Média', color: '#3987e5', shape: 'circle' },
  { key: 'median', label: 'Mediana', color: '#d95926', shape: 'square' },
  { key: 'mode', label: 'Moda', color: '#199e70', shape: 'diamond' },
];

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Todos os valores mais frequentes (pode haver empate), em ordem crescente. */
export function modes(values: number[]): number[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return [...counts.entries()].filter(([, c]) => c === max).map(([v]) => v).sort((a, b) => a - b);
}

export const formatNumber = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
