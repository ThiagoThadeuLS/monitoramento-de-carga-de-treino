import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertCircle, Download, Scale, Gauge, Activity, ShieldCheck, ShieldAlert, Ban, StickyNote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, todayLocalISO } from '../../lib/date';
import { Athlete, PseRecord, PsrRecord, WeightRecord } from '../../types';
import { DailyStatsChart } from './DailyStatsChart';
import { MONOTONY_LIMIT, ZONE_INFO, dailyLoads, format2, formatUA, groupSeries, loadMetrics, sessionLoad } from '../../lib/load';
import { mean } from '../../lib/stats';
import { brDate, downloadCsv, fileSlug, formatKg, localTime, toCsv } from '../../lib/export';

type ProfileAthlete = Athlete & { terms_accepted_at?: string | null };

const RANGES = [
  { days: 30, label: '30 dias' },
  { days: 60, label: '60 dias' },
  { days: 90, label: '90 dias' },
];

const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
};

/** Ficha individual (treinador): evolução de carga, ACWR, PSE, PSR e peso de um atleta. */
export const AthleteProfile: React.FC<{ athleteId: string; onClose: () => void }> = ({ athleteId, onClose }) => {
  const [range, setRange] = useState(30);
  const [athlete, setAthlete] = useState<ProfileAthlete | null>(null);
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [psr, setPsr] = useState<PsrRecord[]>([]);
  const [weight, setWeight] = useState<WeightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = todayLocalISO();
  const from = addDaysISO(today, -(range - 1));
  const loadFrom = addDaysISO(from, -27); // histórico para a carga crônica do primeiro dia

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      supabase.from('athletes').select('*').eq('id', athleteId).maybeSingle(),
      supabase.from('pse_records').select('*').eq('athlete_id', athleteId).gte('date', loadFrom).lte('date', today).order('date'),
      supabase.from('psr_records').select('*').eq('athlete_id', athleteId).gte('date', from).lte('date', today).order('date'),
      supabase.from('weight_records').select('*').eq('athlete_id', athleteId).gte('date', from).lte('date', today).order('date'),
    ]).then(([a, p, r, w]) => {
      if (cancelled) return;
      const err = a.error ?? p.error ?? r.error ?? w.error;
      if (err) setError(`Não foi possível carregar a ficha: ${err.message}`);
      setAthlete((a.data as ProfileAthlete) ?? null);
      setPse((p.data ?? []) as PseRecord[]);
      setPsr((r.data ?? []) as PsrRecord[]);
      setWeight(((w.data ?? []) as WeightRecord[]).map((x) => ({ ...x, weight: Number(x.weight) })));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId, range]);

  // Fecha com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const days = useMemo(() => daysBetween(from, today), [from, today]);
  const perAthlete = useMemo(() => dailyLoads(pse), [pse]);
  const series = useMemo(() => groupSeries(perAthlete, [athleteId], days), [perAthlete, athleteId, days]);
  const sessions7 = pse.filter((r) => r.date >= addDaysISO(today, -6) && sessionLoad(r) !== null).length;
  const m = loadMetrics(perAthlete.get(athleteId), today, sessions7);
  const inRange = pse.filter((r) => r.date >= from);
  const byDay = <T extends { date: string }>(rows: T[], v: (r: T) => number | null) =>
    days.map((d) => {
      const vals = rows.filter((r) => r.date === d).map(v).filter((x): x is number => x !== null);
      return vals.length ? mean(vals) : null;
    });
  const weights = byDay(weight, (r) => r.weight);
  const lastWeight = weight[weight.length - 1];
  const firstWeight = weight[0];
  const skipped = inRange.filter((r) => r.did_not_train);

  const exportCsv = () => {
    type Row = { date: string; at?: string; kind: string; cells: Record<string, string | number | null | undefined | boolean> };
    const rows: Row[] = [
      ...inRange.map((r) => ({
        date: r.date,
        at: r.created_at,
        kind: 'PSE',
        cells: {
          tipo: r.training_type,
          pse: r.rpe_score,
          dur: r.duration_minutes,
          carga: sessionLoad(r),
          nt: r.did_not_train,
          obs: r.observations,
        },
      })),
      ...psr.map((r) => ({
        date: r.date,
        at: r.created_at,
        kind: 'PSR',
        cells: { psr: r.psr_score, fad: r.fatigue_score, sono: r.sleep_score, dor: r.muscle_soreness_score, est: r.stress_score, hum: r.mood_score },
      })),
      ...weight.map((r) => ({ date: r.date, at: r.created_at, kind: 'Peso', cells: { peso: r.weight } })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? '').localeCompare(b.at ?? ''));
    const c = (k: string) => (r: Row) => r.cells[k];
    const csv = toCsv(rows, [
      { label: 'Atleta', value: () => athlete?.nome ?? '' },
      { label: 'Data', value: (r) => brDate(r.date) },
      { label: 'Hora do envio', value: (r) => localTime(r.at) },
      { label: 'Questionário', value: (r) => r.kind },
      { label: 'Tipo de treino', value: c('tipo') },
      { label: 'PSE', value: c('pse') },
      { label: 'Duração (min)', value: c('dur') },
      { label: 'Carga (UA)', value: c('carga') },
      { label: 'Não treinou', value: c('nt') },
      { label: 'Observações / motivo', value: c('obs') },
      { label: 'PSR', value: c('psr') },
      { label: 'Fadiga', value: c('fad') },
      { label: 'Sono', value: c('sono') },
      { label: 'Dor muscular', value: c('dor') },
      { label: 'Estresse', value: c('est') },
      { label: 'Humor', value: c('hum') },
      { label: 'Peso (kg)', value: c('peso') },
    ]);
    downloadCsv(fileSlug('ficha', athlete?.nome ?? 'atleta', from, 'a', today), csv);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${athlete?.nome ?? 'atleta'}`}
        className="bg-slate-950 border border-slate-800 sm:rounded-3xl w-full max-w-5xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-start gap-3" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Ficha do atleta
            </p>
            <h2 className="text-lg sm:text-xl font-black text-white break-words">{athlete?.nome ?? '...'}</h2>
            {athlete && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-xs text-slate-400">{[athlete.classe, athlete.categoria].filter(Boolean).join(' • ') || 'Atleta'}</span>
                {athlete.active === false && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-bold">Inativo</span>
                )}
                {athlete.terms_accepted_at ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Termo aceito em {brDate(athlete.terms_accepted_at.slice(0, 10))}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Termo pendente
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex-shrink-0" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Período + exportar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800 flex items-center gap-2">
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRange(r.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  range === r.days ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span> CSV
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
            </div>
          ) : error ? (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={Gauge} title="Carga 7 dias" value={`${formatUA(m.acute)} UA`} hint={`${m.sessions} treino(s) • crônica ${formatUA(m.chronic)}`} />
                <Stat
                  icon={Activity}
                  title="ACWR hoje"
                  value={format2(m.acwr)}
                  hint={m.zone ? `${ZONE_INFO[m.zone].label}${m.insufficient ? ' • poucos dados' : ''}` : 'sem dados'}
                  tone={m.zone === 'risco' ? 'red' : m.zone === 'atencao' ? 'amber' : undefined}
                />
                <Stat
                  icon={Activity}
                  title="Monotonia / strain"
                  value={format2(m.monotony)}
                  hint={`strain ${m.strain === null ? '—' : formatUA(m.strain)}`}
                  tone={(m.monotony ?? 0) > MONOTONY_LIMIT ? 'amber' : undefined}
                />
                <Stat
                  icon={Scale}
                  title="Peso atual"
                  value={lastWeight ? formatKg(lastWeight.weight) : '—'}
                  hint={
                    lastWeight && firstWeight && lastWeight !== firstWeight
                      ? `${lastWeight.weight - firstWeight.weight >= 0 ? '+' : ''}${(lastWeight.weight - firstWeight.weight).toFixed(1).replace('.', ',')} kg no período`
                      : lastWeight
                      ? `em ${brDate(lastWeight.date)}`
                      : 'sem pesagens'
                  }
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DailyStatsChart
                  title="Carga diária"
                  subtitle="UA (PSE × minutos)"
                  dates={days}
                  scale="auto"
                  unit="UA"
                  lines={[{ key: 'c', label: 'Carga', color: '#3987e5', shape: 'circle', values: series.map((s) => (s.load > 0 ? s.load : null)) }]}
                />
                <DailyStatsChart
                  title="ACWR"
                  subtitle="Aguda (7 dias) ÷ crônica (28 dias)"
                  dates={days}
                  scale="auto"
                  references={[
                    { value: 0.8, label: '0,8', color: '#38bdf8' },
                    { value: 1.3, label: '1,3', color: '#34d399' },
                    { value: 1.5, label: '1,5 risco', color: '#f87171' },
                  ]}
                  lines={[{ key: 'a', label: 'ACWR', color: '#d95926', shape: 'square', values: series.map((s) => s.acwr) }]}
                />
                <DailyStatsChart
                  title="PSE e PSR"
                  subtitle="Média do dia (1–10)"
                  dates={days}
                  lines={[
                    { key: 'pse', label: 'PSE', color: '#d95926', shape: 'circle', values: byDay(inRange, (r) => (r.did_not_train ? null : r.rpe_score)) },
                    { key: 'psr', label: 'PSR', color: '#199e70', shape: 'diamond', values: byDay(psr, (r) => r.psr_score) },
                  ]}
                />
                <DailyStatsChart
                  title="Peso"
                  subtitle="kg"
                  dates={days}
                  scale="auto"
                  unit="kg"
                  lines={[{ key: 'w', label: 'Peso', color: '#3987e5', shape: 'circle', values: weights }]}
                />
              </div>

              {skipped.length > 0 && (
                <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
                  <h3 className="px-4 py-3 border-b border-slate-800 text-sm font-bold text-white flex items-center gap-2">
                    <Ban className="w-4 h-4 text-amber-400" /> Não treinou ({skipped.length})
                  </h3>
                  <ul className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto">
                    {skipped
                      .slice()
                      .reverse()
                      .map((r) => (
                        <li key={r.id} className="px-4 py-2.5 text-sm flex gap-3">
                          <span className="text-xs text-slate-400 w-12 flex-shrink-0 pt-0.5">{brDate(r.date).slice(0, 5)}</span>
                          <span className="text-slate-200 break-words min-w-0 flex items-start gap-1.5">
                            <StickyNote className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                            {r.observations || 'sem motivo informado'}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: typeof Gauge; title: string; value: string; hint: string; tone?: 'red' | 'amber' }> = ({ icon: Icon, title, value, hint, tone }) => (
  <div
    className={`bg-slate-900/90 border rounded-2xl p-3.5 min-w-0 ${
      tone === 'red' ? 'border-red-500/40' : tone === 'amber' ? 'border-amber-500/40' : 'border-slate-800'
    }`}
  >
    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
      <Icon className="w-3 h-3" /> {title}
    </p>
    <p className={`text-lg sm:text-xl font-black mt-0.5 ${tone === 'red' ? 'text-red-300' : tone === 'amber' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    <p className="text-[11px] text-slate-500 truncate">{hint}</p>
  </div>
);
