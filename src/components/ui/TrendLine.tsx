import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  date: string; // AAAA-MM-DD
  value: number;
}

const surface = '#0f172a';
const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const twoDecimals = (v: number) => v.toFixed(2).replace('.', ',');

/** Linha do tempo de medidas esparsas (eixo pela data real): % de gordura, PR... */
export const TrendLine: React.FC<{
  points: TrendPoint[];
  /** Valor no detalhe ao tocar (ex.: "12,50%", "100 kg") */
  format: (v: number) => string;
  /** Valor no eixo vertical (padrão: duas casas) */
  tickFormat?: (v: number) => string;
  /** Folga mínima acima e abaixo dos valores, na unidade do gráfico */
  minPad?: number;
  ariaLabel: string;
  color?: string;
  height?: number;
  /** Altura mínima e máxima do eixo (padrão: automático em volta dos valores) */
  domain?: [number, number];
  className?: string;
}> = ({ points, format, tickFormat = twoDecimals, minPad = 0.6, ariaLabel, color = '#0ea5e9', height = 170, domain, className = '' }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setHover(null), [points.length]);

  const series = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ...p, t: day(p.date) })),
    [points]
  );

  const margin = { top: 14, right: 16, bottom: 22, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const values = series.map((p) => p.value);
  const autoLo = values.length ? Math.min(...values) : 0;
  const autoHi = values.length ? Math.max(...values) : 10;
  const pad = Math.max(minPad, (autoHi - autoLo) * 0.25);
  const [lo, hi] = domain ?? [autoLo - pad, autoHi + pad];

  const t0 = series.length ? series[0].t : 0;
  const t1 = series.length ? series[series.length - 1].t : 1;
  const x = (t: number) => margin.left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => margin.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = series.length > 1 ? `${path}L${x(t1).toFixed(1)},${y(lo).toFixed(1)}L${x(t0).toFixed(1)},${y(lo).toFixed(1)}Z` : '';

  // Datas no eixo: no máximo 5, sempre incluindo a primeira e a última
  const labelIdx = series.length <= 5
    ? series.map((_, i) => i)
    : [0, Math.floor((series.length - 1) / 2), series.length - 1];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!series.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * innerW + margin.left;
    let best = 0;
    for (let i = 1; i < series.length; i++) {
      if (Math.abs(x(series[i].t) - px) < Math.abs(x(series[best].t) - px)) best = i;
    }
    setHover(best);
  };

  const hovered = hover !== null ? series[hover] : null;
  const tipLeft = hovered ? Math.min(Math.max(x(hovered.t), 76), width - 76) : 0;
  const gradId = `tl-${color.replace('#', '')}`;

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`}>
      <svg width={width} height={height} className="block select-none" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke="#1e293b" strokeWidth={1} />
            <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500" fontSize={10}>
              {tickFormat(t)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill={`url(#${gradId})`} />}
        {series.length > 1 && (
          <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {series.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle
              cx={x(p.t)}
              cy={y(p.value)}
              r={hover === i ? 5.5 : 3.5}
              fill={hover === i ? color : surface}
              stroke={color}
              strokeWidth={2.5}
            />
            {labelIdx.includes(i) && (
              <text x={x(p.t)} y={height - 6} textAnchor="middle" className="fill-slate-500" fontSize={10}>
                {shortDate(p.date)}
              </text>
            )}
          </g>
        ))}

        {hovered && (
          <line x1={x(hovered.t)} x2={x(hovered.t)} y1={margin.top} y2={margin.top + innerH} stroke="#475569" strokeWidth={1} />
        )}

        <rect
          x={margin.left}
          y={margin.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          style={{ touchAction: 'pan-y' }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hovered && (
        <div
          className="absolute top-0 -translate-x-1/2 pointer-events-none bg-slate-950/95 border border-slate-700 rounded-lg px-2.5 py-1.5 shadow-xl text-[11px] whitespace-nowrap z-10"
          style={{ left: tipLeft }}
        >
          <p className="text-slate-400 capitalize">{longDate(hovered.date)}</p>
          <p className="text-white font-bold">{format(hovered.value)}</p>
        </div>
      )}
    </div>
  );
};
