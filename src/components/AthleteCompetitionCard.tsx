import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock, MapPin,
  Scale, Share2, ShieldCheck, Target, Tent, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react';
import { useShareStory } from './athlete/ShareStory';
import { AthleteCompetition, eventEndDate, fieldTrainingRange, isFieldTraining, listAthleteCompetitions } from '../lib/competitions';
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
  /** Abre o registro de peso (sem isso, rola até o formulário da página) */
  onRegisterWeight?: () => void;
  /** Peso já registrado hoje: o botão de registrar some */
  weighedToday?: boolean;
  /** Hoje é dia de pesagem definido pelo treinador (fora desses dias, sem botão de registrar) */
  canRegisterWeight?: boolean;
}

const STATUS_STYLE: Record<WeightPlanStatus, { box: string; icon: typeof CheckCircle2; iconColor: string }> = {
  risco: { box: 'bg-red-500/10 border-red-500/40 text-red-200', icon: AlertTriangle, iconColor: 'text-red-400' },
  atencao: { box: 'bg-amber-500/10 border-amber-500/40 text-amber-200', icon: AlertTriangle, iconColor: 'text-amber-400' },
  seguro: { box: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  no_alvo: { box: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  sem_dados: { box: 'bg-slate-800/60 border-slate-600/60 text-slate-300', icon: Scale, iconColor: 'text-slate-400' },
  sem_categoria: { box: 'bg-slate-800/60 border-slate-600/60 text-slate-300', icon: Target, iconColor: 'text-slate-400' },
  sem_limite: { box: 'bg-sky-500/10 border-sky-500/40 text-sky-200', icon: ShieldCheck, iconColor: 'text-sky-400' },
  pesagem_passou: { box: 'bg-slate-800/60 border-slate-600/60 text-slate-300', icon: CheckCircle2, iconColor: 'text-slate-400' },
};

const kg = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1).replace('.', ',')} kg`;

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '');

/** Cartão da próxima competição na aba Peso do atleta. */
export const AthleteCompetitionCard: React.FC<AthleteCompetitionCardProps> = ({ token, refreshKey = 0, onRegisterWeight, weighedToday, canRegisterWeight = true }) => {
  const today = todayISO();
  const share = useShareStory();
  const [competitions, setCompetitions] = useState<AthleteCompetition[]>([]);
  const [weights, setWeights] = useState<WeightPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(false);
  // Resumido numa linha; abre sozinho quando o peso pede atenção (null = segue o status)
  const [expanded, setExpanded] = useState<boolean | null>(null);
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

  // Treinamentos de campo que ainda não acabaram: aviso próprio, sem pesagem
  const camps = useMemo(
    () => competitions.filter((c) => isFieldTraining(c) && eventEndDate(c) >= today).sort((a, b) => a.data.localeCompare(b.data)),
    [competitions, today]
  );
  const upcoming = useMemo(
    () =>
      competitions
        .filter((c): c is AthleteCompetition & { data_pesagem: string } => !isFieldTraining(c) && !!c.data_pesagem && c.data_pesagem >= today)
        .sort((a, b) => a.data_pesagem.localeCompare(b.data_pesagem)),
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

  if (!token || loading) return null;

  // Aviso do treinamento de campo (igual ao da competição, sem pesagem nem peso)
  const campCards = camps.map((c) => {
    const until = daysBetweenISO(today, c.data);
    const running = until <= 0;
    return (
      <section key={c.id} className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/40 p-3.5 flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border ${running ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
          {running ? (
            <Tent className="w-5 h-5" />
          ) : (
            <>
              <span className="text-sm font-black leading-none">{until}</span>
              <span className="text-[8px] uppercase font-bold">{until === 1 ? 'dia' : 'dias'}</span>
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 flex items-center gap-1">
            <Tent className="w-3 h-3" /> {running ? 'Treinamento de campo em andamento' : 'Treinamento de campo'}
          </span>
          <span className="block text-sm font-bold text-white break-words">{c.nome}</span>
          <span className="block text-[11px] text-slate-400">
            {fieldTrainingRange(c)}
            {c.local ? ` • ${c.local}` : ''}
          </span>
          {c.observacoes && <span className="block text-[11px] text-slate-300 mt-1 whitespace-pre-wrap break-words">{c.observacoes}</span>}
        </span>
      </section>
    );
  });

  if (!next || !plan) return campCards.length ? <div className="space-y-3">{campCards}</div> : null;

  const days = daysBetweenISO(today, next.data_pesagem);
  const style = STATUS_STYLE[plan.status];
  const StatusIcon = style.icon;
  const category = next.categoria?.trim() || '';
  const needsToLose = plan.needsToLose;

  const focusWeightForm = () => {
    if (onRegisterWeight) onRegisterWeight();
    else document.getElementById('weight-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const open = expanded ?? (plan.status === 'risco' || plan.status === 'atencao');

  if (!open) {
    return (
      <div className="space-y-3">
      {campCards}
      <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-sky-950/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-slate-800/30 transition-colors"
        >
          <span className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border ${days <= 7 ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-sky-500/15 border-sky-500/40 text-sky-200'}`}>
            <span className="text-sm font-black leading-none">{Math.max(0, days)}</span>
            <span className="text-[8px] uppercase font-bold">{days === 1 ? 'dia' : 'dias'}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300 flex items-center gap-1">
              <Trophy className="w-3 h-3" /> Próxima competição • pesagem {shortDate(next.data_pesagem)}
            </span>
            <span className="block text-sm font-bold text-white truncate">{next.nome}</span>
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-lg border flex-shrink-0 ${style.box}`}>{WEIGHT_STATUS_LABEL[plan.status]}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
    {campCards}
    <section className="rounded-3xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 shadow-2xl overflow-hidden">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mb-1 text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1"
              aria-expanded
            >
              <ChevronUp className="w-3 h-3" /> Resumir
            </button>
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
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <span
              className={`text-center px-2.5 py-2 rounded-2xl border ${
                days <= 7 ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
              }`}
              title="Dias até a pesagem"
            >
              <span className="block text-xl font-black leading-none">{Math.max(0, days)}</span>
              <span className="block text-[9px] uppercase font-bold mt-0.5">{days === 1 ? 'dia' : 'dias'}</span>
            </span>
            {share && (
              <button
                type="button"
                onClick={() =>
                  share.openStory({
                    kind: 'competicao',
                    nome: next.nome,
                    data: next.data,
                    dias: daysBetweenISO(today, next.data),
                    local: next.local,
                    categoria: next.categoria,
                  })
                }
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1"
                title="Compartilhar a contagem para a competição"
              >
                <Share2 className="w-3 h-3" /> Compartilhar
              </button>
            )}
          </div>
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
            <p className="text-[10px] uppercase font-bold text-slate-500">Acima</p>
            <p className={`text-lg font-black leading-tight ${needsToLose ? 'text-amber-300' : plan.gap !== null ? 'text-emerald-300' : 'text-slate-400'}`}>
              {plan.gap !== null ? (needsToLose ? kg(plan.gap) : 'No peso') : '—'}
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
            {plan.showLimit && plan.limit && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 opacity-80">
                <Target className="w-3.5 h-3.5 flex-shrink-0" />
                {plan.phase === 'pesagem' ? (
                  <>Hoje: <strong>até {kg(plan.limit.weight)}</strong> (peso da categoria)</>
                ) : (
                  <>
                    Limite agora: <strong>até {kg(plan.limit.weight)}</strong> ({plan.limit.percent}% acima)
                  </>
                )}
              </p>
            )}
            {plan.showLimit && plan.nextLimit && (
              <p className="text-[11px] mt-1 flex items-center gap-1 opacity-80">
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />A partir de {shortDate(plan.nextLimit.from)}: até {kg(plan.nextLimit.weight)} (
                {plan.nextLimit.percent}% acima)
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
          {!weighedToday && canRegisterWeight && (
          <button
            type="button"
            onClick={focusWeightForm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
          >
            <Scale className="w-4 h-4" /> Registrar peso de hoje
          </button>
          )}
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
          Limite do clube: até 8% acima da categoria longe da competição, 5% na semana anterior e 3% na semana da competição. Pese-se
          sempre no mesmo horário, em jejum e após ir ao banheiro.
        </p>
      </div>
    </section>
    </div>
  );
};
