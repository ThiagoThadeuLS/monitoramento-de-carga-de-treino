import React from 'react';
import { TrendLine } from './TrendLine';

export interface BodyFatPoint {
  date: string; // AAAA-MM-DD
  percentual: number;
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Linha do tempo do % de gordura (medidas esparsas, eixo pela data real). */
export const BodyFatTrend: React.FC<{
  points: BodyFatPoint[];
  color?: string;
  height?: number;
  domain?: [number, number];
  className?: string;
}> = ({ points, ...rest }) => (
  <TrendLine
    {...rest}
    points={points.map((p) => ({ date: p.date, value: p.percentual }))}
    format={pct}
    ariaLabel="Evolução do percentual de gordura"
  />
);
