import React, { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../lib/stats';

export interface DailyPoint {
  date: string; // AAAA-MM-DD
  count: number; // respostas no dia (0 = sem dado)
  mean: number | null;
  median: number | null;
  mode: number | null; // valor plotado (o maior, em caso de empate)
  modes: number[]; // todos os valores empatados como moda
}

export interface ExpectedPoint {
  value: number; // PSE esperada do dia (média dos treinos programados)
  sessions: number; // quantos treinos programados
}

export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle';

/** Uma linha do gráfico (o grupo todo, ou um tipo de treino). */
export interface ChartLine {
  key: string;
  label: string;
  color: string;
  shape: MarkerShape;
  values: (number | null)[]; // um valor por dia (null = sem dado)
  /** Texto do tooltip para o dia (ex.: "5 e 7" na moda). */
  describe?: (i: number) => string;
  /** Respostas por dia, mostradas no tooltip ao lado do valor. */
  counts?: number[];
  /** PSE esperada por dia, comparada com esta linha. Desenhada como traço de referência. */
  expected?: (ExpectedPoint | null)[];
  /** Cor do traço da PSE esperada (padrão: cinza-claro, para o modo com uma só linha). */
  expectedColor?: string;
}

interface DailyStatsChartProps {
  title: string;
  subtitle: string;
  dates: string[];
  lines: ChartLine[];
  /** Controles no cabeçalho (ex.: setas Média/Moda). */
  actions?: React.ReactNode;
}

// Referência neutra quando há uma só linha: traço claro, diferente pelo formato e não pela cor
export const EXPECTED_NEUTRAL = '#e2e8f0';
const SURFACE = '#0f172a';

export const ExpectedSwatch: React.FC<{ color?: string }> = ({ color = EXPECTED_NEUTRAL }) => (
  <svg width={22} height={12} className="flex-shrink-0" aria-hidden>
    <rect x={3} y={3.5} width={16} height={5} rx={2.5} fill={color} stroke={SURFACE} strokeWidth={1.5} />
  </svg>
);

const Y_TICKS = [0, 2, 4, 6, 8, 10];
const MARGIN = { top: 12, right: 12, bottom: 28, left: 30 };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const signed = (v: number) => `${v > 0 ? '+' : ''}${formatNumber(Math.round(v * 10) / 10)}`;

const Marker: React.FC<{ shape: MarkerShape; cx: number; cy: number; color: string; big?: boolean }> = ({ shape, cx, cy, color, big }) => {
  const r = big ? 5.5 : 4.5;
  const common = { fill: color, stroke: SURFACE, strokeWidth: 2 };
  if (shape === 'square') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.5} {...common} />;
  if (shape === 'diamond') {
    const d = r * 1.3;
    return <path d={`M${cx},${cy - d}L${cx + d},${cy}L${cx},${cy + d}L${cx - d},${cy}Z`} {...common} />;
  }
  if (shape === 'triangle') {
    const d = r * 1.35;
    return <path d={`M${cx},${cy - d}L${cx + d},${cy + d * 0.75}L${cx - d},${cy + d * 0.75}Z`} {...common} />;
  }
  return <circle cx={cx} cy={cy} r={r} {...common} />;
};

/** Ícone de uma linha (cor + formato do ponto), usado na legenda e nos seletores. */
export const LineSwatch: React.FC<{ color: string; shape: MarkerShape }> = ({ color, shape }) => (
  <svg width={22} height={12} className="flex-shrink-0" aria-hidden>
    <line x1={1} x2={21} y1={6} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Marker shape={shape} cx={11} cy={6} color={color} />
  </svg>
);

/** Linhas diárias (escala 0–10) com crosshair + tooltip. SVG puro, responsivo. */
export const DailyStatsChart: React.FC<DailyStatsChartProps> = ({ title, subtitle, dates, lines, actions }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverRaw, setHover] = useState<number | null>(null);
  // Se o período encolher (ex.: "Hoje"), um índice antigo não pode apontar para um dia que não existe mais
  const hover = hoverRaw !== null && hoverRaw < dates.length ? hoverRaw : null;
  useEffect(() => setHover(null), [dates.length, dates[0]]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 500 ? 210 : 260;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const n = dates.length;
  const x = (i: number) => MARGIN.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => MARGIN.top + innerH - (v / 10) * innerH;

  // Linha quebra nos dias sem dado (não inventa valor)
  const pathsFor = (values: (number | null)[]) => {
    const parts: string[] = [];
    let current = '';
    values.forEach((v, i) => {
      if (v === null) {
        if (current) parts.push(current);
        current = '';
      } else {
        current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      }
    });
    if (current) parts.push(current);
    return parts;
  };

  const maxTicks = Math.max(2, Math.floor(innerW / 64));
  const step = Math.max(1, Math.ceil(n / maxTicks));
  const xTicks = dates.map((_, i) => i).filter((i) => i % step === 0);
  const showMarkers = n <= 45;
  const withExpected = lines.filter((l) => l.expected);
  const hasData = lines.some((l) => l.values.some((v) => v !== null) || l.expected?.some(Boolean));
  const expectedHalf = Math.min(9, Math.max(5, innerW / Math.max(n, 1) / 2 - 1));
  const expectedColor = (l: ChartLine) => l.expectedColor ?? EXPECTED_NEUTRAL;
  const multi = lines.length > 1;

  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * innerW;
    setHover(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round((px / innerW) * (n - 1)))));
  };

  const hoverHasData = hover !== null && lines.some((l) => l.values[hover] !== null || l.expected?.[hover]);
  const tooltipLeft = hover !== null ? Math.min(Math.max(x(hover), 110), width - 110) : 0;
  const text = (l: ChartLine, i: number) => l.describe?.(i) ?? formatNumber(l.values[i]!);
  const rowsWithData = dates.map((_, i) => i).filter((i) => lines.some((l) => l.values[i] !== null || l.expected?.[i]));

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
      <div className="mb-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-white text-sm sm:text-base">{title}</h3>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
          {actions}
        </div>
        {/* Legenda (sempre presente com 2+ séries ou com PSE esperada) */}
        {(multi || withExpected.length > 0) && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-1.5">
                <LineSwatch color={l.color} shape={l.shape} />
                {l.label}
              </li>
            ))}
            {multi
              ? withExpected.map((l) => (
                  <li key={`exp-${l.key}`} className="flex items-center gap-1.5">
                    <ExpectedSwatch color={expectedColor(l)} />
                    Esperada {l.label}
                  </li>
                ))
              : withExpected.length > 0 && (
                  <li className="flex items-center gap-1.5">
                    <ExpectedSwatch color={expectedColor(withExpected[0])} />
                    PSE esperada
                  </li>
                )}
          </ul>
        )}
      </div>

      <div ref={wrapRef} className="relative w-full">
        <svg width={width} height={height} className="block select-none" role="img" aria-label={title}>
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="#1e293b" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500" fontSize={11}>
                {t}
              </text>
            </g>
          ))}

          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-500" fontSize={11}>
              {shortDate(dates[i])}
            </text>
          ))}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke="#475569" strokeWidth={1} />
          )}

          {/* PSE esperada: traço de referência atrás das linhas (na cor da linha comparada quando há várias) */}
          {withExpected.map((l) =>
            l.expected!.map((e, i) =>
              e ? (
                <rect
                  key={`exp-${l.key}-${i}`}
                  x={x(i) - expectedHalf}
                  y={y(e.value) - 2.5}
                  width={expectedHalf * 2}
                  height={5}
                  rx={2.5}
                  fill={expectedColor(l)}
                  stroke={SURFACE}
                  strokeWidth={1.5}
                />
              ) : null
            )
          )}

          {lines.map((l) => (
            <g key={l.key}>
              {pathsFor(l.values).map((d, i) => (
                <path key={i} d={d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {l.values.map((v, i) => {
                if (v === null) return null;
                // Pontos isolados (sem vizinhos) sempre aparecem, senão sumiriam
                const isolated = l.values[i - 1] == null && l.values[i + 1] == null;
                if (!showMarkers && hover !== i && !isolated) return null;
                return (
                  <g key={i}>
                    <Marker shape={l.shape} cx={x(i)} cy={y(v)} color={l.color} big={hover === i} />
                    {/* Um único dia: escreve o valor ao lado do ponto */}
                    {n === 1 && (
                      <text x={x(i) + 10} y={y(v)} dy="0.32em" fontSize={12} className="fill-slate-200 font-semibold">
                        {l.label} {formatNumber(Math.round(v * 10) / 10)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            style={{ touchAction: 'pan-y' }}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 pointer-events-none">
            Nenhuma resposta no período
          </div>
        )}

        {hover !== null && (
          <div
            className="absolute top-0 -translate-x-1/2 pointer-events-none bg-slate-950/95 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs whitespace-nowrap space-y-1 z-10"
            style={{ left: tooltipLeft }}
          >
            <p className="text-slate-400 capitalize">{longDate(dates[hover])}</p>
            {!hoverHasData && <p className="text-slate-500">Sem respostas</p>}
            {hoverHasData &&
              lines.map((l) => {
                const v = l.values[hover];
                const e = l.expected?.[hover] ?? null;
                const c = l.counts?.[hover] ?? 0;
                if (v === null && !e && multi) {
                  return (
                    <p key={l.key} className="flex items-center gap-1.5 text-slate-500">
                      <LineSwatch color={l.color} shape={l.shape} />
                      {l.label}: sem respostas
                    </p>
                  );
                }
                return (
                  <div key={l.key}>
                    <p className={`flex items-center gap-1.5 ${v === null ? 'text-slate-500' : 'text-white font-semibold'}`}>
                      <LineSwatch color={l.color} shape={l.shape} />
                      {l.label}: {v === null ? 'sem respostas' : text(l, hover)}
                      {v !== null && c > 0 && (
                        <span className="text-slate-500 font-normal">
                          ({c} {c === 1 ? 'resposta' : 'respostas'})
                        </span>
                      )}
                    </p>
                    {e && (
                      <p className="flex items-center gap-1.5 text-slate-300 pl-0.5">
                        <ExpectedSwatch color={expectedColor(l)} />
                        Esperada: {formatNumber(e.value)}
                        <span className="text-slate-500">({e.sessions} {e.sessions === 1 ? 'treino' : 'treinos'})</span>
                        {v !== null && <strong className="text-white">• diferença {signed(v - e.value)}</strong>}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <details className="mt-2 text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-white select-none">Ver valores em tabela</summary>
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-950 text-slate-500 sticky top-0">
              <tr>
                <th className="py-1.5 px-3 font-semibold">Data</th>
                {lines.map((l) => (
                  <React.Fragment key={l.key}>
                    <th className="py-1.5 px-3 font-semibold whitespace-nowrap">{l.label}</th>
                    {l.expected && <th className="py-1.5 px-3 font-semibold whitespace-nowrap">Esperada{multi ? ` ${l.label}` : ''}</th>}
                    {l.counts && <th className="py-1.5 px-3 font-semibold whitespace-nowrap">Respostas{multi ? ` ${l.label}` : ''}</th>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rowsWithData.map((i) => (
                <tr key={dates[i]}>
                  <td className="py-1.5 px-3">{shortDate(dates[i])}</td>
                  {lines.map((l) => (
                    <React.Fragment key={l.key}>
                      <td className="py-1.5 px-3 text-slate-200 font-semibold whitespace-nowrap">
                        {l.values[i] === null ? '—' : text(l, i)}
                      </td>
                      {l.expected && (
                        <td className="py-1.5 px-3 text-slate-200">{l.expected[i] ? formatNumber(l.expected[i]!.value) : '—'}</td>
                      )}
                      {l.counts && <td className="py-1.5 px-3">{l.counts[i]}</td>}
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
