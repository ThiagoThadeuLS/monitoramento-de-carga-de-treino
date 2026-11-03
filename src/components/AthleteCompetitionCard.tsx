import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock, MapPin,
  Scale, ShieldCheck, Target, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react';
import { AthleteCompetition, listAthleteCompetitions } from '../lib/competitions';
import { getAthleteHistory } from '../lib/athleteAuth';
import { addDaysISO, todayISO } from '../lib/date';
import { DailyStatsChart } from './coach/DailyStatsChart';
import {
  WEIGHT_STATUS_LABEL, WeightPlan, WeightPlanStatus, WeightPoint, buildWeightPlan, daysBetweenISO, parseCategoryWeight,
} from '../lib/weightPlan';

interface AthleteCompetitionCardProps {
  token: string | null;
  /** Muda quando o atleta registra um novo peso, para recalcular os alertas. */
  refreshKey?: number;
}

const STATUS_STYLE: Record<WeightPlanStatus, { box: string; icon: typeof CheckCircle2; iconColor: string }> = {
  risco: { box: 'bg-red-500/10 border-red-500/40 text-red-200', icon: AlertTriangle, iconColor: 'text-red-400' },
  atencao: { box: 'bg-amber-500/10 border-amber-500/40 text-amber-200', icon: AlertTriangle, iconColor: 'text-amber-400' },
  seguro: { box: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  no_alvo: { box: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  sem_dados: { box: 'bg-slate-800/60 border-slate-600/60 text-slate-300', icon: Scale, iconColor: 'text-slate-400' },
  sem_categoria: { box: 'bg-slate-800/60 border-slate-600/60 text-slate-300', icon: Target, iconColor: 'text-slate-400' },
  sem_limite: { box: 'bg-sky-500/10 border-sky-500/40 text-sky-200', icon: ShieldCheck, iconColor: 'text-sky-400' },
};

const kg = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1).replace('.', ',')} kg`;

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '');

/** Cartão da próxima competição na aba Peso do atleta. */
export const AthleteCompetitionCard: React.FC<AthleteCompetitionCardProps> = ({ token, refreshKey = 0 }) => {
  const today = todayISO();
  const [competitions, setCompetitions] = useState<AthleteCompetition[]>([]);
  const [weights, setWeights] = useState<WeightPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(false);
  // Depois da primeira carga, uma nova pesagem atualiza o cartão sem fazê-lo sumir.
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!token) {
      setCompetitions([]);
      setWeights([]);
      setLoading(false);
      loadedOnce.current = false;
      return;
    }
    let cancelled = false;
    if (!loadedOnce.current) setLoading(true);
    const from = addDaysISO(today, -35);
    Promise.all([listAthleteCompetitions(token), getAthleteHistory(token, from, today)])
      .then(([list, history]) => {
        if (cancelled) return;
        setCompetitions(list);
        setWeights(
          history.weight
            .filter((w) => Number.isFinite(w.weight) && w.weight > 0)
            .map((w) => ({ date: w.date, weight: Number(w.weight) }))
            .sort((a, b) => a.date.localeCompare(b.date))
        );
      })
      .catch(() => {
        // Sem competições ativas ou módulo ainda não instalado: a aba Peso segue como antes.
        if (!cancelled) {
          setCompetitions([]);
          setWeights([]);
        }
      })
      .finally(() => {
        if (cancelled) return;
        loadedOnce.current = true;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, today]);

  const upcoming = useMemo(
    () => competitions.filter((c) => c.data >= today).sort((a, b) => a.data_pesagem.localeCompare(b.data_pesagem)),
    [competitions, today]
  );
  const next = upcoming[0] ?? null;
  const others = upcoming.slice(1, 4);

  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

  const plan: WeightPlan | null = next
    ? buildWeightPlan({
        currentWeight: latestWeight?.weight ?? next.peso_atual,
        currentDate: latestWeight?.date ?? next.peso_data,
        targetWeight: parseCategoryWeight(next.categoria),
        category: next.categoria,
        weighInDate: next.data_pesagem,
        today,
        history: weights,
      })
    : null;

  const chart = useMemo(() => {
    const dates: string[] = [];
    for (let i = 20; i >= 0; i--) dates.push(addDaysISO(today, -i));
    const byDate = new Map<string, number>();
    for (const point of weights) {
      if (point.date >= dates[0] && point.date <= today) byDate.set(point.date, point.weight);
    }
    return {
      dates,
      values: dates.map((d) => byDate.get(d) ?? null),
    };
  }, [weights, today]);

  if (!token || loading || !next || !plan) return null;

  const days = daysBetweenISO(today, next.data_pesagem);
  const style = STATUS_STYLE[plan.status];
  const StatusIcon = style.icon;
  const category = next.categoria?.trim() || '';
  const needsToLose = plan.gap !== null && plan.gap > 0.05;

  const focusWeightForm = () => {
    document.getElementById('weight-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="rounded-3xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 shadow-2xl overflow-hidden">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Próxima competição
            </p>
            <h2 className="text-lg font-black text-white leading-tight break-words">{next.nome}</h2>
            <p className="text-xs text-slate-400 capitalize flex items-center gap-1 mt-1">
              <CalendarDays className="w-3.5 h-3.5 text-violet-300" />
              {longDate(next.data)} • Pesagem {shortDate(next.data_pesagem)}
              {next.hora_pesagem && ` às ${hhmm(next.hora_pesagem)}`}
            </p>
            {next.local && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{next.local}</span>
              </p>
            )}
          </div>
          <span
            className={`flex-shrink-0 text-center px-2.5 py-2 rounded-2xl border ${
              days <= 7 ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
            }`}
          >
            <span className="block text-xl font-black leading-none">{Math.max(0, days)}</span>
            <span className="block text-[9px] uppercase font-bold mt-0.5">{days === 1 ? 'dia' : 'dias'}</span>
          </span>
        </div>

        {next.observacoes && (
          <p className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            {next.observacoes}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {category && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-300 font-semibold">
              Categoria {category}
            </span>
          )}
          {!category && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400">
              Categoria não cadastrada
            </span>
          )}
          {plan.lastWeightDate && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Última pesagem {shortDate(plan.lastWeightDate)}
            </span>
          )}
        </div>

        {/* Números principais */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
            <p className="text-[10px] uppercase font-bold text-slate-500">Peso atual</p>
            <p className="text-lg font-black text-white leading-tight">{kg(plan.current)}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
            <p className="text-[10px] uppercase font-bold text-slate-500">Peso de luta</p>
            <p className="text-lg font-black text-sky-300 leading-tight">{kg(plan.target)}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
            <p className="text-[10px] uppercase font-bold text-slate-500">Falta</p>
            <p className={`text-lg font-black leading-tight ${needsToLose ? 'text-amber-300' : plan.gap !== null ? 'text-emerald-300' : 'text-slate-400'}`}>
              {plan.gap !== null ? (needsToLose ? kg(plan.gap) : 'No alvo') : '—'}
            </p>
          </div>
        </div>

        {/* Status seguro */}
        <div className={`rounded-2xl border p-3.5 flex items-start gap-2.5 ${style.box}`}>
          <StatusIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-bold">{plan.title}</p>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-white/20 opacity-80">
                {WEIGHT_STATUS_LABEL[plan.status]}
              </span>
            </div>
            <p className="text-xs mt-0.5 opacity-90 break-words">{plan.message}</p>
            {plan.current && plan.status !== 'sem_dados' && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 opacity-80">
                <Target className="w-3.5 h-3.5" />
                Faixa segura na pesagem: <strong>{kg(plan.safeMin)} a {kg(plan.safeMax)}</strong>
              </p>
            )}
            {plan.trendWeeklyRate !== null && plan.status !== 'sem_dados' && (
              <p className="text-[11px] mt-1 flex items-center gap-1 opacity-80">
                {plan.trendWeeklyRate <= 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                Tendência recente: {plan.trendWeeklyRate > 0 ? '+' : ''}
                {plan.trendWeeklyRate.toFixed(1).replace('.', ',')} kg por semana
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={focusWeightForm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
          >
            <Scale className="w-4 h-4" /> Registrar peso de hoje
          </button>
          {chart.values.some((v) => v !== null) && (
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold"
            >
              {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showChart ? 'Ocultar gráfico' : 'Ver evolução'}
            </button>
          )}
        </div>

        {showChart && (
          <DailyStatsChart
            title="Evolução do peso"
            subtitle={`Últimos 21 dias${plan.target ? ` • meta ${kg(plan.target)}` : ''}`}
            dates={chart.dates}
            scale="auto"
            unit="kg"
            lines={[
              {
                key: 'peso',
                label: 'Peso',
                color: '#38bdf8',
                shape: 'circle',
                values: chart.values,
                describe: (i) => kg(chart.values[i]),
              },
            ]}
            references={plan.target ? [{ value: plan.target, label: 'Peso de luta', color: '#fbbf24' }] : []}
          />
        )}

        {others.length > 0 && (
          <div className="pt-1 border-t border-slate-800">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Outras competições</p>
            <ul className="space-y-1">
              {others.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span className="truncate">{c.nome}</span>
                  <span className="text-slate-500 flex-shrink-0">Pesagem {shortDate(c.data_pesagem)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Pese-se sempre no mesmo horário, em jejum e após ir ao banheiro. Perder peso rápido demais prejudica a força e a recuperação.
        </p>
      </div>
    </section>
  );
};
