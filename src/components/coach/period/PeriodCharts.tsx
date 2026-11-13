import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PseRecord, PsrRecord, TrainingSession } from '../../../types';
import { TRAINING_TYPES } from '../../../data/constants';
import { formatNumber, mean } from '../../../lib/stats';
import { ChartLine, DailyPoint, DailyStatsChart, ExpectedPoint } from '../DailyStatsChart';
import { PSE_STATS, PseStat, TYPE_STYLES, brDate, dailyStats, statStyle } from './shared';

interface Props {
  from: string;
  to: string;
  days: string[];
  /** respostas e treinos já filtrados pela seleção de atletas */
  pse: PseRecord[];
  psr: PsrRecord[];
  sessions: TrainingSession[];
  selectedTypes: string[];
  pseView: 'grouped' | 'split';
  pseStat: PseStat;
  onPseStatChange: (stat: PseStat) => void;
  showExpected: boolean;
  /** " • Grupo X" quando há seleção de atletas */
  groupLabel: string;
}

const pseValue = (r: PseRecord) => (r.did_not_train ? null : r.rpe_score);
const valueOf = (d: DailyPoint, stat: PseStat) => d[stat];
// Na moda, mostra todos os valores empatados
const describeOf = (d: DailyPoint, stat: PseStat) => (stat === 'mode' ? d.modes.map(formatNumber).join(' e ') : formatNumber(d.mean!));

/** Gráficos de PSE (média ou moda, condensado ou por tipo) e de PSR do período. */
export const PeriodCharts: React.FC<Props> = ({
  from,
  to,
  days,
  pse,
  psr,
  sessions,
  selectedTypes,
  pseView,
  pseStat,
  onPseStatChange,
  showExpected,
  groupLabel,
}) => {
  const pseInTypes = useMemo(() => pse.filter((r) => r.training_type && selectedTypes.includes(r.training_type)), [pse, selectedTypes]);
  const pseDaily = useMemo(() => dailyStats(pseInTypes, days, pseValue), [pseInTypes, days]);
  const pseByType = useMemo(
    () =>
      TRAINING_TYPES.filter((t) => selectedTypes.includes(t)).map((t) => ({
        type: t,
        daily: dailyStats(
          pse.filter((r) => r.training_type === t),
          days,
          pseValue
        ),
      })),
    [pse, days, selectedTypes]
  );
  const psrDaily = useMemo(() => dailyStats(psr, days, (r) => r.psr_score), [psr, days]);

  // PSE esperada por dia (média dos treinos programados), do grupo ou de um tipo
  const expectedFor = (types: string[]): (ExpectedPoint | null)[] => {
    const byDay = new Map<string, number[]>();
    for (const s of sessions) {
      if (!types.includes(s.training_type)) continue;
      byDay.set(s.date, [...(byDay.get(s.date) ?? []), s.expected_pse]);
    }
    return days.map((d) => {
      const list = byDay.get(d);
      return list ? { value: mean(list), sessions: list.length } : null;
    });
  };

  const pseStatInfo = PSE_STATS.find((x) => x.key === pseStat)!;
  const pseLines: ChartLine[] =
    pseView === 'grouped'
      ? [
          {
            key: 'group',
            label: pseStatInfo.label,
            color: statStyle(pseStat).color,
            shape: statStyle(pseStat).shape,
            values: pseDaily.map((d) => valueOf(d, pseStat)),
            describe: (i) => describeOf(pseDaily[i], pseStat),
            counts: pseDaily.map((d) => d.count),
            expected: showExpected ? expectedFor(selectedTypes) : undefined,
          },
        ]
      : pseByType.map(({ type, daily }) => ({
          key: type,
          label: TYPE_STYLES[type].short,
          color: TYPE_STYLES[type].color,
          shape: TYPE_STYLES[type].shape,
          values: daily.map((d) => valueOf(d, pseStat)),
          describe: (i) => describeOf(daily[i], pseStat),
          counts: daily.map((d) => d.count),
          // Cada tipo comparado com a própria PSE esperada, na mesma cor
          expected: showExpected ? expectedFor([type]) : undefined,
          expectedColor: TYPE_STYLES[type].color,
        }));
  const psrLines: ChartLine[] = [
    {
      key: 'psr',
      label: 'Média',
      color: statStyle('mean').color,
      shape: statStyle('mean').shape,
      values: psrDaily.map((d) => d.mean),
      counts: psrDaily.map((d) => d.count),
    },
  ];

  const periodLabel = from === to ? brDate(from) : `${brDate(from)} a ${brDate(to)}`;
  const typesLabel =
    selectedTypes.length === TRAINING_TYPES.length ? 'todos os tipos' : selectedTypes.map((t) => TYPE_STYLES[t].short).join(' + ');

  const idx = PSE_STATS.findIndex((x) => x.key === pseStat);
  const statAt = (delta: number) => PSE_STATS[(idx + delta + PSE_STATS.length) % PSE_STATS.length];

  return (
    // PSR (como o atleta chega) em cima; PSE (como foi o treino) embaixo
    <div data-tour="period-charts" className="grid grid-cols-1 gap-4">
      <DailyStatsChart
        title="Média de PSR do grupo por dia"
        subtitle={`Recuperação (1–10) • ${periodLabel}${groupLabel}`}
        dates={days}
        lines={psrLines}
      />
      <DailyStatsChart
        title={pseView === 'grouped' ? `${pseStatInfo.title} do grupo por dia` : `${pseStatInfo.title} por tipo de treino`}
        subtitle={`Esforço (1–10) • ${periodLabel} • ${typesLabel}${groupLabel} • sem contar quem não treinou`}
        dates={days}
        lines={pseLines}
        actions={
          <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label="Alternar entre média e moda">
            <button
              type="button"
              onClick={() => onPseStatChange(statAt(-1).key)}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
              title={`Ver ${statAt(-1).label.toLowerCase()}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center px-1 min-w-[52px]">
              <span className="text-[11px] font-bold text-white">{pseStatInfo.label}</span>
              <span className="flex gap-1 mt-0.5" aria-hidden>
                {PSE_STATS.map((x) => (
                  <span key={x.key} className={`w-1.5 h-1.5 rounded-full ${x.key === pseStat ? 'bg-sky-400' : 'bg-slate-600'}`} />
                ))}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onPseStatChange(statAt(1).key)}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
              title={`Ver ${statAt(1).label.toLowerCase()}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />
    </div>
  );
};
