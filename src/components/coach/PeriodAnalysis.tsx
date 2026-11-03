import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, todayISO } from '../../lib/date';
import { Athlete, PseRecord, PsrRecord, TrainingSession } from '../../types';
import { ExpectedSwatch, LineSwatch } from './DailyStatsChart';
import { TRAINING_TYPES } from '../../data/constants';
import { sessionAppliesTo, useClubGroups } from '../../lib/groups';
import { fetchClubAthletes } from '../../lib/athletes';
import { useClub } from '../../lib/club';
import { MissingResponses } from './MissingResponses';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection, selectionLabel } from './GroupFilter';
import { MAX_DAYS, PRESETS, PseStat, TYPE_STYLES, daysBetween, fetchRange } from './period/shared';
import { PeriodCharts } from './period/PeriodCharts';
import { ExportMenu } from './period/ExportMenu';
import { DayAlerts } from './period/DayAlerts';

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

/** Aba Período: gráficos de PSE/PSR, quem não respondeu, exportação e alertas do dia. */
export const PeriodAnalysis: React.FC = () => {
  const [from, setFrom] = useState(() => addDaysISO(todayISO(), -13));
  const [to, setTo] = useState(todayISO);
  const [athletes, setAthletes] = useState<Map<string, Athlete>>(new Map());
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // Filtro por grupos e/ou atletas específicos (vazio = todos os atletas)
  const { groups } = useClubGroups();
  const { club } = useClub();
  const clubId = club?.id ?? null;
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  // Gráfico de PSE: tipos de treino incluídos, forma de exibir e estatística (média/moda)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(TRAINING_TYPES);
  const [pseView, setPseView] = useState<'grouped' | 'split'>('grouped');
  const [pseStat, setPseStat] = useState<PseStat>('mean');
  const [showExpected, setShowExpected] = useState(true);

  const rangeError =
    !from || !to
      ? 'Preencha as duas datas.'
      : from > to
      ? 'A data "De" precisa ser anterior à data "Até".'
      : addDaysISO(from, MAX_DAYS - 1) < to
      ? 'Escolha um período de no máximo 1 ano.'
      : '';

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
        const sessionRows = sessionRes.data;
        if (cancelled) return;
        setAthletes(new Map(athleteRows.map((a) => [a.id, a as Athlete])));
        setPse(pseRows);
        setPsr(psrRows);
        setSessions((sessionRows ?? []) as TrainingSession[]);
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

  const reload = () => setReloadKey((k) => k + 1);

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
  const nameOf = useCallback((id: string) => athletes.get(id)?.nome ?? 'Atleta removido', [athletes]);
  const groupLabel = selected ? ` • ${selectionLabel(selection, groups, athleteList)}` : '';

  const toggleType = (t: string) =>
    setSelectedTypes((cur) =>
      cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : TRAINING_TYPES.filter((x) => x === t || cur.includes(x))
    );

  const applyPreset = (n: number) => {
    const today = todayISO();
    setTo(today);
    setFrom(addDaysISO(today, -(n - 1)));
  };
  const activePreset = PRESETS.find((p) => to === todayISO() && from === addDaysISO(to, -(p.days - 1)));

  const dateInputCls =
    'w-full lg:w-auto bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer';

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div data-tour="period-filters" className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex items-center gap-2 text-sky-400 lg:pb-2.5">
            <CalendarRange className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Período</span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-3">
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">De</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateInputCls} />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateInputCls} />
            </label>
          </div>

          <div className="flex items-center gap-2 lg:pb-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => applyPreset(p.days)}
                className={`flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  activePreset?.days === p.days ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="lg:ml-auto flex gap-2">
            <ExportMenu
              from={from}
              to={to}
              pse={pse}
              psr={psr}
              selected={selected}
              nameOf={nameOf}
              disabled={loading || !!rangeError}
              onError={setError}
            />
            <button
              type="button"
              onClick={reload}
              disabled={loading || !!rangeError}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Atletas (grupos e/ou pessoas): vale para os gráficos e para os alertas do dia */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-end gap-2">
          <GroupFilter groups={groups} athletes={athleteList} value={selection} onChange={setSelection} className="sm:w-72" />
          {selected && (
            <p className="text-[11px] text-slate-400 sm:pb-2.5">
              Mostrando só {selected.size} atleta{selected.size === 1 ? '' : 's'} selecionado{selected.size === 1 ? '' : 's'} e a PSE esperada dos treinos
              destinados a essa seleção.
            </p>
          )}
        </div>

        {/* Gráfico de PSE: tipos de treino e forma de exibir */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">Tipos de treino (gráficos de PSE)</span>
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

        {(rangeError || error) && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{rangeError || error}</span>
          </div>
        )}
      </div>

      {loading && !rangeError ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando dados do período...</p>
        </div>
      ) : (
        !rangeError && (
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
        )
      )}

      {/* Quem não respondeu dentro do prazo (período + seleção) */}
      {!loading && !error && !rangeError && (
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

      <DayAlerts selected={selected} nameOf={nameOf} />
    </div>
  );
};
