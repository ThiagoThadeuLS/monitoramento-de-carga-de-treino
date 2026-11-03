import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export type ChartKind = 'line' | 'bar' | 'area' | 'radar';

interface Props {
  kind: ChartKind;
  data: any[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
}

export const ChartRenderer: React.FC<Props> = ({ kind, data, dataKey, xKey = 'date', color = '#0ea5e9', height = 260 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-slate-400" style={{ height }}>
        Sem dados para este gráfico
      </div>
    );
  }

  if (kind === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (kind === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (kind === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (kind === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#cbd5f5" />
          <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 10 }} />
          <Radar name={dataKey} dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.25} />
          <Tooltip />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  return null;
};
