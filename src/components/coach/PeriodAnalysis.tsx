import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, RefreshCw, Flame, HeartPulse, AlertCircle, Loader2, ChevronLeft, ChevronRight, Ban, X, StickyNote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, todayLocalISO } from '../../lib/date';
import { Athlete, PseRecord, PsrRecord, TrainingSession } from '../../types';
import { ChartLine, DailyStatsChart, DailyPoint, ExpectedPoint, ExpectedSwatch, LineSwatch, MarkerShape } from './DailyStatsChart';
import { TRAINING_TYPES } from '../../data/constants';
import { STATS, formatNumber, mean, median, modes } from '../../lib/stats';
import { sessionAppliesTo, useClubGroups } from '../../lib/groups';
import { MissingResponses } from './MissingResponses';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection, selectionLabel } from './GroupFilter';

const PSE_LIMIT = 6; // tabela: PSE acima de 6
const PSR_LIMIT = 5; // tabela: variáveis da PSR abaixo de 5
const MAX_DAYS = 366;
const MOBILE_PREVIEW = 10; // celular: mostra os 10 primeiros e um botão "Mostrar todos"

const PSR_VARIABLES: { key: keyof PsrRecord; label: string; short: string }[] = [
  { key: 'psr_score', label: 'Recuperação', short: 'Recup.' },
  { key: 'fatigue_score', label: 'Fadiga', short: 'Fadiga' },
  { key: 'sleep_score', label: 'Sono', short: 'Sono' },
  { key: 'muscle_soreness_score', label: 'Dor muscular', short: 'Dor' },
  { key: 'stress_score', label: 'Estresse', short: 'Estresse' },
  { key: 'mood_score', label: 'Humor', short: 'Humor' },
];

// Cores dos tipos de treino: validadas para o fundo escuro e diferentes das cores das estatísticas
const TYPE_STYLES: Record<string, { color: string; shape: MarkerShape; short: string }> = {
  'Treino Técnico': { color: '#c98500', shape: 'circle', short: 'Técnico' },
  'Treino Randori': { color: '#d55181', shape: 'square', short: 'Randori' },
  'Treino Físico': { color: '#9085e9', shape: 'triangle', short: 'Físico' },
};

type PseStat = 'mean' | 'mode';
const PSE_STATS: { key: PseStat; label: string; title: string }[] = [
  { key: 'mean', label: 'Média', title: 'Média de PSE' },
  { key: 'mode', label: 'Moda', title: 'Moda da PSE' },
];
const statStyle = (key: 'mean' | 'mode') => STATS.find((s) => s.key === key)!;

const PRESETS = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
];

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Lista todos os dias entre "de" e "até" (inclusive). */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDaysISO(d, 1)) days.push(d);
  return days;
}

/** O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas. */
async function fetchRange<T>(table: string, from: string, to: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

function dailyStats<T extends { date: string }>(records: T[], days: string[], value: (r: T) => number | null): DailyPoint[] {
  const byDay = new Map<string, number[]>();
  for (const r of records) {
    const v = value(r);
    if (v === null) continue;
    const list = byDay.get(r.date) ?? [];
    list.push(v);
    byDay.set(r.date, list);
  }
  return days.map((date) => {
    const list = byDay.get(date) ?? [];
    if (!list.length) return { date, count: 0, mean: null, median: null, mode: null, modes: [] };
    const m = modes(list);
    // Empate na moda: a linha usa o maior valor; o tooltip mostra todos
    return { date, count: list.length, mean: mean(list), median: median(list), mode: m[m.length - 1], modes: m };
  });
}

const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const byCreated = (a: { created_at?: string }, b: { created_at?: string }) =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '');

export const PeriodAnalysis: React.FC = () => {
  const [from, setFrom] = useState(() => addDaysISO(todayLocalISO(), -13));
  const [to, setTo] = useState(todayLocalISO);
  const [athletes, setAthletes] = useState<Map<string, Athlete>>(new Map());
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllPse, setShowAllPse] = useState(false);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  // Filtro por grupos e/ou atletas específicos (vazio = todos os atletas)
  const { groups } = useClubGroups();
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  // Gráfico de PSE: tipos de treino incluídos e forma de exibir
  const [selectedTypes, setSelectedTypes] = useState<string[]>(TRAINING_TYPES);
  const [pseView, setPseView] = useState<'grouped' | 'split'>('grouped');
  // Gráfico de PSE: setas alternam entre a média e a moda das respostas
  const [pseStat, setPseStat] = useState<PseStat>('mean');
  const [showExpected, setShowExpected] = useState(true);

  // Tabelas de alerta: um único dia, independente do período dos gráficos
  const [tableDay, setTableDay] = useState(todayLocalISO);
  const [dayPse, setDayPse] = useState<PseRecord[]>([]);
  const [dayPsr, setDayPsr] = useState<PsrRecord[]>([]);
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState('');

  const loadDay = async () => {
    if (!supabase || !tableDay) return;
    setDayLoading(true);
    setDayError('');
    try {
      const [pseRes, psrRes] = await Promise.all([
        supabase.from('pse_records').select('*').eq('date', tableDay),
        supabase.from('psr_records').select('*').eq('date', tableDay),
      ]);
      if (pseRes.error) throw pseRes.error;
      if (psrRes.error) throw psrRes.error;
      setDayPse(pseRes.data ?? []);
      setDayPsr(psrRes.data ?? []);
      setShowAllPse(false);
    } catch (err: any) {
      console.error('Erro ao carregar dia:', err);
      setDayError(`Não foi possível carregar os dados do dia: ${err.message ?? err}`);
    } finally {
      setDayLoading(false);
    }
  };

  useEffect(() => {
    loadDay();
  }, [tableDay]);

  const rangeError =
    !from || !to ? 'Preencha as duas datas.' :
    from > to ? 'A data "De" precisa ser anterior à data "Até".' :
    addDaysISO(from, MAX_DAYS - 1) < to ? 'Escolha um período de no máximo 1 ano.' :
    '';

  const load = async () => {
    if (!supabase || rangeError) return;
    setLoading(true);
    setError('');
    try {
      const [athleteRes, pseRows, psrRows] = await Promise.all([
        supabase.from('athletes').select('id, nome, classe, categoria, active'),
        fetchRange<PseRecord>('pse_records', from, to),
        fetchRange<PsrRecord>('psr_records', from, to),
      ]);
      if (athleteRes.error) throw athleteRes.error;
      setAthletes(new Map((athleteRes.data ?? []).map((a) => [a.id, a as Athlete])));
      setPse(pseRows);
      setPsr(psrRows);
      // Cronograma (PSE esperada). Se a tabela ainda não existir, o gráfico segue sem a marcação.
      const { data: sessionRows } = await supabase
        .from('training_sessions')
        .select('*')
        .gte('date', from)
        .lte('date', to);
      setSessions((sessionRows ?? []) as TrainingSession[]);
    } catch (err: any) {
      console.error('Erro ao carregar período:', err);
      setError(`Não foi possível carregar os dados: ${err.message ?? err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [from, to]);

  const days = useMemo(() => (rangeError ? [] : daysBetween(from, to)), [from, to, rangeError]);

  // Seleção: respostas só dos atletas escolhidos; PSE esperada só dos treinos destinados a eles
  const athleteList = useMemo(
    () => Array.from(athletes.values()).map((a) => ({ id: a.id, nome: a.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [athletes]
  );
  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const inGroup = (athleteId: string) => !selected || selected.has(athleteId);
  const pseG = useMemo(() => pse.filter((r) => inGroup(r.athlete_id)), [pse, selected]);
  const psrG = useMemo(() => psr.filter((r) => inGroup(r.athlete_id)), [psr, selected]);
  const dayPseG = useMemo(() => dayPse.filter((r) => inGroup(r.athlete_id)), [dayPse, selected]);
  const dayPsrG = useMemo(() => dayPsr.filter((r) => inGroup(r.athlete_id)), [dayPsr, selected]);
  const sessionsG = useMemo(
    () => (selected ? sessions.filter((s) => Array.from(selected).some((a) => sessionAppliesTo(s, a, groups))) : sessions),
    [sessions, selected, groups]
  );
  const pseValue = (r: PseRecord) => (r.did_not_train ? null : r.rpe_score);
  const pseInTypes = useMemo(
    () => pseG.filter((r) => r.training_type && selectedTypes.includes(r.training_type)),
    [pseG, selectedTypes]
  );
  const pseDaily = useMemo(() => dailyStats(pseInTypes, days, pseValue), [pseInTypes, days]);
  const pseByType = useMemo(
    () => TRAINING_TYPES.filter((t) => selectedTypes.includes(t)).map((t) => ({
      type: t,
      daily: dailyStats(pseG.filter((r) => r.training_type === t), days, pseValue),
    })),
    [pseG, days, selectedTypes]
  );
  // PSE esperada por dia (média dos treinos programados), do grupo ou de um tipo
  const expectedFor = (types: string[]): (ExpectedPoint | null)[] => {
    const byDay = new Map<string, number[]>();
    for (const s of sessionsG) {
      if (!types.includes(s.training_type)) continue;
      byDay.set(s.date, [...(byDay.get(s.date) ?? []), s.expected_pse]);
    }
    return days.map((d) => {
      const list = byDay.get(d);
      return list ? { value: mean(list), sessions: list.length } : null;
    });
  };
  const psrDaily = useMemo(() => dailyStats(psrG, days, (r) => r.psr_score), [psrG, days]);

  // Valor e texto do dia para a estatística escolhida (na moda, mostra todos os empatados)
  const valueOf = (d: DailyPoint, stat: PseStat) => d[stat];
  const describeOf = (d: DailyPoint, stat: PseStat) =>
    stat === 'mode' ? d.modes.map(formatNumber).join(' e ') : formatNumber(d.mean!);

  const pseStatInfo = PSE_STATS.find((x) => x.key === pseStat)!;
  const pseLines: ChartLine[] =
    pseView === 'grouped'
      ? [{
          key: 'group',
          label: pseStatInfo.label,
          color: statStyle(pseStat).color,
          shape: statStyle(pseStat).shape,
          values: pseDaily.map((d) => valueOf(d, pseStat)),
          describe: (i) => describeOf(pseDaily[i], pseStat),
          counts: pseDaily.map((d) => d.count),
          expected: showExpected ? expectedFor(selectedTypes) : undefined,
        }]
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
  const psrLines: ChartLine[] = [{
    key: 'psr',
    label: 'Média',
    color: statStyle('mean').color,
    shape: statStyle('mean').shape,
    values: psrDaily.map((d) => d.mean),
    counts: psrDaily.map((d) => d.count),
  }];
  const groupLabel = selected ? ` • ${selectionLabel(selection, groups, athleteList)}` : '';
  const typesLabel =
    selectedTypes.length === TRAINING_TYPES.length ? 'todos os tipos' : selectedTypes.map((t) => TYPE_STYLES[t].short).join(' + ');

  const toggleType = (t: string) =>
    setSelectedTypes((cur) =>
      cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : TRAINING_TYPES.filter((x) => x === t || cur.includes(x))
    );

  const nameOf = (id: string) => athletes.get(id)?.nome ?? 'Atleta removido';

  const highPse = useMemo(
    () =>
      dayPseG
        .filter((r) => !r.did_not_train && (r.rpe_score ?? 0) > PSE_LIMIT)
        .sort((a, b) => (b.rpe_score ?? 0) - (a.rpe_score ?? 0) || byCreated(a, b)),
    [dayPseG]
  );

  // PSR com ao menos uma variável abaixo de 5, agrupada por atleta
  const lowPsrByAthlete = useMemo(() => {
    const groups = new Map<string, PsrRecord[]>();
    for (const r of dayPsrG) {
      if (!PSR_VARIABLES.some((v) => (r[v.key] as number) < PSR_LIMIT)) continue;
      const list = groups.get(r.athlete_id) ?? [];
      list.push(r);
      groups.set(r.athlete_id, list);
    }
    return [...groups.entries()]
      .map(([athleteId, records]) => ({ athleteId, records: records.sort(byCreated) }))
      .sort((a, b) => nameOf(a.athleteId).localeCompare(nameOf(b.athleteId), 'pt-BR'));
  }, [dayPsrG, athletes]);

  const lowPsrCount = lowPsrByAthlete.reduce((sum, g) => sum + g.records.length, 0);

  // Quem marcou "não treinei" no dia (com o motivo informado)
  const notTrained = useMemo(
    () => dayPseG.filter((r) => r.did_not_train).sort((a, b) => nameOf(a.athlete_id).localeCompare(nameOf(b.athlete_id), 'pt-BR') || byCreated(a, b)),
    [dayPseG, athletes]
  );
  const [reasonOpen, setReasonOpen] = useState<PseRecord | null>(null);

  const applyPreset = (n: number) => {
    const today = todayLocalISO();
    setTo(today);
    setFrom(addDaysISO(today, -(n - 1)));
  };

  const activePreset = PRESETS.find((p) => to === todayLocalISO() && from === addDaysISO(to, -(p.days - 1)));

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex items-center gap-2 text-sky-400 lg:pb-2.5">
            <CalendarRange className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Período</span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-3">
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">De</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full lg:w-auto bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="w-full lg:w-auto bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 lg:pb-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => applyPreset(p.days)}
                className={`flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  activePreset?.days === p.days
                    ? 'bg-sky-500 text-slate-950 border-sky-500'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading || !!rangeError}
            className="lg:ml-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Atletas (grupos e/ou pessoas): vale para os gráficos e para os alertas do dia */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-end gap-2">
          <GroupFilter groups={groups} athletes={athleteList} value={selection} onChange={setSelection} className="sm:w-72" />
          {selected && (
            <p className="text-[11px] text-slate-400 sm:pb-2.5">
              Mostrando só {selected.size} atleta{selected.size === 1 ? '' : 's'} selecionado{selected.size === 1 ? '' : 's'} e a PSE esperada dos treinos destinados a essa seleção.
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
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      on ? 'bg-slate-800 text-white border-slate-500' : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] leading-none ${
                        on ? 'bg-sky-500 border-sky-500 text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
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
              {([['grouped', 'Condensado'], ['split', 'Por tipo de treino']] as const).map(([v, label]) => (
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
              title="Vem do Cronograma, que guarda até a semana passada."
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                showExpected ? 'bg-slate-800 text-white border-slate-500' : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] leading-none ${
                  showExpected ? 'bg-sky-500 border-sky-500 text-slate-950' : 'border-slate-600'
                }`}
              >
                {showExpected ? '✓' : ''}
              </span>
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
      ) : !rangeError && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DailyStatsChart
            title={pseView === 'grouped' ? `${pseStatInfo.title} do grupo por dia` : `${pseStatInfo.title} por tipo de treino`}
            subtitle={`Esforço (1–10) • ${from === to ? brDate(from) : `${brDate(from)} a ${brDate(to)}`} • ${typesLabel}${groupLabel} • sem contar quem não treinou`}
            dates={days}
            lines={pseLines}
            actions={
              <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label="Alternar entre média e moda">
                {(() => {
                  const idx = PSE_STATS.findIndex((x) => x.key === pseStat);
                  const go = (delta: number) => setPseStat(PSE_STATS[(idx + delta + PSE_STATS.length) % PSE_STATS.length].key);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => go(-1)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
                        title={`Ver ${PSE_STATS[(idx + PSE_STATS.length - 1) % PSE_STATS.length].label.toLowerCase()}`}
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
                        onClick={() => go(1)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
                        title={`Ver ${PSE_STATS[(idx + 1) % PSE_STATS.length].label.toLowerCase()}`}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  );
                })()}
              </div>
            }
          />
          <DailyStatsChart
            title="Média de PSR do grupo por dia"
            subtitle={`Recuperação (1–10) • ${from === to ? brDate(from) : `${brDate(from)} a ${brDate(to)}`}${groupLabel}`}
            dates={days}
            lines={psrLines}
          />
        </div>
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

      {/* Alertas de um único dia */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-sm font-bold text-white">Alertas do dia</p>
            <p className="text-xs text-slate-400">As duas tabelas abaixo mostram apenas o dia escolhido.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <label className="block flex-1 sm:flex-none">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dia</span>
            <input
              type="date"
              value={tableDay}
              onChange={(e) => setTableDay(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            />
          </label>
          <button
            type="button"
            onClick={() => setTableDay(todayLocalISO())}
            className="px-3 py-2 rounded-lg text-xs font-bold border bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={loadDay}
            disabled={dayLoading}
            title="Atualizar"
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${dayLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {dayError ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{dayError}</span>
        </div>
      ) : dayLoading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando dados do dia...</p>
        </div>
      ) : (
        <>

          {/* Tabela: PSE acima de 6 */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                PSE acima de {PSE_LIMIT} • {brDate(tableDay)}
              </h3>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {highPse.length} {highPse.length === 1 ? 'registro' : 'registros'}
              </span>
            </header>

            {highPse.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhum PSE acima de {PSE_LIMIT} neste dia.</p>
            ) : (
              <>
                {/* Mobile: cards */}
                <ul className="sm:hidden divide-y divide-slate-800/60">
                  {(showAllPse ? highPse : highPse.slice(0, MOBILE_PREVIEW)).map((r) => (
                    <li key={r.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-white text-sm truncate">{nameOf(r.athlete_id)}</p>
                        <p className="text-xs text-slate-400">
                          Enviado às {timeOf(r.created_at)} • {r.training_type || 'Treino'}
                        </p>
                        {r.observations && <p className="text-xs text-slate-500 mt-1 italic">“{r.observations}”</p>}
                      </div>
                      <PseBadge value={r.rpe_score!} />
                    </li>
                  ))}
                </ul>
                {highPse.length > MOBILE_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setShowAllPse(!showAllPse)}
                    className="sm:hidden w-full py-3 border-t border-slate-800 text-xs font-bold text-sky-400 hover:bg-slate-800/40"
                  >
                    {showAllPse ? 'Mostrar menos' : `Mostrar todos (${highPse.length})`}
                  </button>
                )}

                {/* Desktop: tabela */}
                <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Envio</th>
                        <th className="py-3 px-3">Atleta</th>
                        <th className="py-3 px-3">Tipo de treino</th>
                        <th className="py-3 px-3">PSE</th>
                        <th className="py-3 px-4">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {highPse.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 text-xs whitespace-nowrap">{timeOf(r.created_at)}</td>
                          <td className="py-3 px-3 font-bold text-white">{nameOf(r.athlete_id)}</td>
                          <td className="py-3 px-3 text-xs">{r.training_type || '—'}</td>
                          <td className="py-3 px-3"><PseBadge value={r.rpe_score!} /></td>
                          <td className="py-3 px-4 text-xs text-slate-400 max-w-xs">{r.observations || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Tabela: quem não treinou (toque para ver o motivo) */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                  <Ban className="w-4 h-4 text-amber-400" />
                  Não treinaram • {brDate(tableDay)}
                </h3>
                <p className="text-xs text-slate-500">Toque no atleta para ver o motivo.</p>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {notTrained.length} {notTrained.length === 1 ? 'atleta' : 'atletas'}
              </span>
            </header>

            {notTrained.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Ninguém marcou "não treinei" neste dia.</p>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {notTrained.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setReasonOpen(r)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{nameOf(r.athlete_id)}</p>
                        <p className="text-xs text-slate-400 truncate">
                          Enviado às {timeOf(r.created_at)} • {r.observations?.trim() || 'sem motivo informado'}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 flex-shrink-0">
                        <StickyNote className="w-3.5 h-3.5" /> Ver motivo
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Motivo de não ter treinado */}
          {reasonOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
              onClick={() => setReasonOpen(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Motivo de ${nameOf(reasonOpen.athlete_id)}`}
                className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                      <Ban className="w-3.5 h-3.5" /> Não treinou • {brDate(reasonOpen.date)}
                    </p>
                    <h3 className="text-lg font-bold text-white break-words">{nameOf(reasonOpen.athlete_id)}</h3>
                    <p className="text-xs text-slate-400">Enviado às {timeOf(reasonOpen.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setReasonOpen(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex-shrink-0" title="Fechar">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-5 overflow-y-auto">
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                    <StickyNote className="w-3.5 h-3.5" /> Motivo informado pelo atleta
                  </p>
                  {reasonOpen.observations?.trim() ? (
                    <p className="text-sm text-slate-200 whitespace-pre-wrap break-words bg-slate-950 border border-slate-800 rounded-xl p-3">
                      {reasonOpen.observations}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Sem motivo informado (resposta enviada antes da regra que tornou o motivo obrigatório).</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabela: variáveis da PSR abaixo de 5, por atleta */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                  PSR abaixo de {PSR_LIMIT} por atleta • {brDate(tableDay)}
                </h3>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {lowPsrByAthlete.length} {lowPsrByAthlete.length === 1 ? 'atleta' : 'atletas'} • {lowPsrCount}{' '}
                  {lowPsrCount === 1 ? 'resposta' : 'respostas'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Valores abaixo de {PSR_LIMIT} aparecem destacados em vermelho.</p>
            </header>

            {lowPsrByAthlete.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma variável da PSR abaixo de {PSR_LIMIT} neste dia.</p>
            ) : (
              <>
                {/* Mobile: um card por atleta, só as variáveis em alerta */}
                <ul className="sm:hidden divide-y divide-slate-800/60">
                  {lowPsrByAthlete.map(({ athleteId, records }) => (
                    <li key={athleteId} className="p-4 space-y-2">
                      <p className="font-bold text-white text-sm">{nameOf(athleteId)}</p>
                      {records.map((r) => (
                        <div key={r.id} className="flex items-start gap-3">
                          <span className="text-xs text-slate-400 w-12 flex-shrink-0 pt-1">{timeOf(r.created_at)}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {PSR_VARIABLES.filter((v) => (r[v.key] as number) < PSR_LIMIT).map((v) => (
                              <span
                                key={v.key}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-semibold"
                              >
                                {v.label}: {r[v.key] as number}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>

                {/* Desktop: tabela completa, agrupada por atleta */}
                <div className="hidden sm:block overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Atleta</th>
                        <th className="py-3 px-3">Envio</th>
                        {PSR_VARIABLES.map((v) => (
                          <th key={v.key} className="py-3 px-2 text-center" title={v.label}>
                            <span className="hidden lg:inline">{v.label}</span>
                            <span className="lg:hidden">{v.short}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lowPsrByAthlete.map(({ athleteId, records }) =>
                        records.map((r, i) => (
                          <tr
                            key={r.id}
                            className={`hover:bg-slate-800/40 transition-colors ${i === 0 ? 'border-t border-slate-700' : ''}`}
                          >
                            {i === 0 && (
                              <td rowSpan={records.length} className="py-3 px-4 font-bold text-white align-top">
                                {nameOf(athleteId)}
                                <span className="block text-[11px] font-normal text-slate-500">
                                  {records.length} {records.length === 1 ? 'resposta' : 'respostas'}
                                </span>
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-xs whitespace-nowrap">{timeOf(r.created_at)}</td>
                            {PSR_VARIABLES.map((v) => {
                              const value = r[v.key] as number;
                              const low = value < PSR_LIMIT;
                              return (
                                <td key={v.key} className="py-2.5 px-2 text-center">
                                  <span
                                    className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded-md text-xs ${
                                      low
                                        ? 'bg-red-500/15 text-red-300 border border-red-500/30 font-bold'
                                        : 'text-slate-500'
                                    }`}
                                    aria-label={low ? `${v.label} ${value}, abaixo de ${PSR_LIMIT}` : undefined}
                                  >
                                    {value}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
};

const PseBadge: React.FC<{ value: number }> = ({ value }) => (
  <span
    className={`inline-block text-xs px-2.5 py-1 rounded-lg border font-bold whitespace-nowrap ${
      value >= 8 ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    }`}
  >
    {value} / 10
  </span>
);
