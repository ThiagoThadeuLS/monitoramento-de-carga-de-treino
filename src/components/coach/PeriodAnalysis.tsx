import React, { useMemo, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Athlete, PseRecord, PsrRecord, TrainingSession } from '../../types';
import { ExpectedSwatch, LineSwatch } from './DailyStatsChart';
import { TRAINING_TYPES } from '../../data/constants';
import { sessionAppliesTo, useClubGroups } from '../../lib/groups';
import { fetchClubAthletes } from '../../lib/athletes';
import { useClub } from '../../lib/club';
import { MissingResponses } from './MissingResponses';
import { resolveSelection, selectionLabel } from './GroupFilter';
import { PseStat, TYPE_STYLES, daysBetween, fetchRange } from './period/shared';
import { PeriodCharts } from './period/PeriodCharts';
import { AnalysisFilterValue, analysisRangeError } from './AnalysisFilter';

const toggleCls = (on: boolean) =>
  `flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
    on ? 'bg-slate-800 text-white border-slate-500' : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
  }`;

const CheckBox: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] leading-none ${
      on ? 'bg-sky-500 border-sky-500 text-slate-950' : 'border-slate-600'
    }`}
  >
    {on ? '✓' : ''}
  </span>
);

/** Aba Período: gráficos de PSE/PSR e quem não respondeu no prazo (período e atletas vêm do filtro das Análises). */
export const PeriodAnalysis: React.FC<{ filter: AnalysisFilterValue }> = ({ filter }) => {
  const { from, to, selection, reloadKey } = filter;
  const [athletes, setAthletes] = useState<Map<string, Athlete>>(new Map());
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { groups } = useClubGroups();
  const { club } = useClub();
  const clubId = club?.id ?? null;
  // Gráfico de PSE: tipos de treino incluídos, forma de exibir e estatística (média/moda)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(TRAINING_TYPES);
  const [pseView, setPseView] = useState<'grouped' | 'split'>('grouped');
  const [pseStat, setPseStat] = useState<PseStat>('mean');
  const [showExpected, setShowExpected] = useState(true);
  const [options, setOptions] = useState(false);

  const rangeError = analysisRangeError(from, to);

  useEffect(() => {
    if (!supabase || rangeError) return;
    const db = supabase;
    // Trocar o período rápido: só a última busca atualiza a tela
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        // Cronograma (PSE esperada): se a tabela ainda não existir, o gráfico segue sem a marcação
        const [athleteRows, pseRows, psrRows, sessionRes] = await Promise.all([
          fetchClubAthletes(clubId, reloadKey > 0),
          fetchRange<PseRecord>('pse_records', from, to),
          fetchRange<PsrRecord>('psr_records', from, to),
          db.from('training_sessions').select('*').gte('date', from).lte('date', to),
        ]);
        if (cancelled) return;
        setAthletes(new Map(athleteRows.map((a) => [a.id, a as Athlete])));
        setPse(pseRows);
        setPsr(psrRows);
        setSessions((sessionRes.data ?? []) as TrainingSession[]);
      } catch (err: any) {
        console.error('Erro ao carregar período:', err);
        if (!cancelled) setError(`Não foi possível carregar os dados: ${err.message ?? err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, rangeError, reloadKey, clubId]);

  const days = useMemo(() => (rangeError ? [] : daysBetween(from, to)), [from, to, rangeError]);

  // Seleção: respostas só dos atletas escolhidos; PSE esperada só dos treinos destinados a eles
  const athleteList = useMemo(
    () =>
      Array.from(athletes.values())
        .map((a) => ({ id: a.id, nome: a.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [athletes]
  );
  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const pseG = useMemo(() => (selected ? pse.filter((r) => selected.has(r.athlete_id)) : pse), [pse, selected]);
  const psrG = useMemo(() => (selected ? psr.filter((r) => selected.has(r.athlete_id)) : psr), [psr, selected]);
  const sessionsG = useMemo(
    () => (selected ? sessions.filter((s) => Array.from(selected).some((a) => sessionAppliesTo(s, a, groups))) : sessions),
    [sessions, selected, groups]
  );
  const groupLabel = selected ? ` • ${selectionLabel(selection, groups, athleteList)}` : '';

  const toggleType = (t: string) =>
    setSelectedTypes((cur) =>
      cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : TRAINING_TYPES.filter((x) => x === t || cur.includes(x))
    );

  if (rangeError) return null;

  return (
    <div className="space-y-6">
      {/* Opções do gráfico de PSE (recolhidas) */}
      <div data-tour="period-filters" className="bg-slate-900/80 border border-slate-800 rounded-2xl">
        <button
          type="button"
          onClick={() => setOptions(!options)}
          aria-expanded={options}
          className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-slate-300 hover:text-white"
        >
          <SlidersHorizontal className="w-4 h-4 text-sky-400" />
          Opções do gráfico
          <span className="font-normal text-slate-500 truncate">
            • {selectedTypes.length === TRAINING_TYPES.length ? 'todos os tipos' : selectedTypes.map((t) => TYPE_STYLES[t].short).join(', ')} •{' '}
            {pseView === 'grouped' ? 'condensado' : 'por tipo'}
            {showExpected ? ' • PSE esperada' : ''}
          </span>
          <ChevronDown className={`w-4 h-4 ml-auto flex-shrink-0 transition-transform ${options ? 'rotate-180' : ''}`} />
        </button>

        {options && (
          <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-4 pb-4 pt-1 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 xl:pt-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">Tipos de treino (PSE)</span>
              <div className="grid grid-cols-3 sm:flex gap-2" role="group" aria-label="Tipos de treino no gráfico de PSE">
                {TRAINING_TYPES.map((t) => {
                  const on = selectedTypes.includes(t);
                  const style = TYPE_STYLES[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleType(t)}
                      title={on && selectedTypes.length === 1 ? 'Mantenha ao menos um tipo marcado' : undefined}
                      className={toggleCls(on)}
                    >
                      <CheckBox on={on} />
                      {pseView === 'split' && (
                        <span className={`hidden sm:inline ${on ? '' : 'opacity-40'}`}>
                          <LineSwatch color={style.color} shape={style.shape} />
                        </span>
                      )}
                      {style.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 xl:ml-auto">
              <span className="text-[10px] uppercase font-bold text-slate-400">Exibir PSE</span>
              <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-lg" role="radiogroup" aria-label="Forma de exibir a PSE">
                {(
                  [
                    ['grouped', 'Condensado'],
                    ['split', 'Por tipo de treino'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={pseView === v}
                    onClick={() => setPseView(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                      pseView === v ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={showExpected}
                onClick={() => setShowExpected(!showExpected)}
                title="Vem do Cronograma, que guarda todos os treinos."
                className={toggleCls(showExpected)}
              >
                <CheckBox on={showExpected} />
                <span className={showExpected ? '' : 'opacity-40'}>
                  <ExpectedSwatch />
                </span>
                PSE esperada
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando dados do período...</p>
        </div>
      ) : (
        <PeriodCharts
          from={from}
          to={to}
          days={days}
          pse={pseG}
          psr={psrG}
          sessions={sessionsG}
          selectedTypes={selectedTypes}
          pseView={pseView}
          pseStat={pseStat}
          onPseStatChange={setPseStat}
          showExpected={showExpected}
          groupLabel={groupLabel}
        />
      )}

      {/* Quem não respondeu dentro do prazo (período + seleção) */}
      {!loading && !error && (
        <MissingResponses
          days={days}
          athletes={Array.from(athletes.values())}
          selected={selected}
          groups={groups}
          sessions={sessions}
          pse={pse}
          psr={psr}
        />
      )}
    </div>
  );
};
