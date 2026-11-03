import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, AlertCircle, Flame, HeartPulse, Scale, Pencil, Trash2, ShieldCheck, Ban } from 'lucide-react';
import { AthleteHistory as HistoryData, deleteAthleteRecord, getAthleteHistory } from '../lib/athleteAuth';
import { addDaysISO, todayISO } from '../lib/date';
import { DailyStatsChart } from './coach/DailyStatsChart';
import { dailyLoads, formatUA, loadMetrics, sessionLoad } from '../lib/load';
import { mean } from '../lib/stats';
import { brDate, formatKg, localTime } from '../lib/export';
import { TermsModal } from './TermsGate';

type Kind = 'pse' | 'psr' | 'peso';
interface Entry {
  kind: Kind;
  id: string;
  date: string;
  at?: string;
  title: string;
  detail: string;
  badge: string;
}

const RANGES = [7, 30, 90];

/** Aba Histórico do atleta: suas respostas, evolução e correção das respostas de hoje. */
export const AthleteHistory: React.FC<{
  token: string;
  athleteId: string;
  clubName: string;
  termsAcceptedAt?: string | null;
  /** Depois de apagar para corrigir, abre o formulário certo */
  onCorrect: (kind: Kind) => void;
}> = ({ token, athleteId, clubName, termsAcceptedAt, onCorrect }) => {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ entry: Entry; correct: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const today = todayISO();
  const from = addDaysISO(today, -(range - 1));

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    // 27 dias antes para calcular a carga crônica
    getAthleteHistory(token, addDaysISO(from, -27), today)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, from, today]);
  useEffect(load, [load]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= today; d = addDaysISO(d, 1)) out.push(d);
    return out;
  }, [from, today]);

  const pse = (data?.pse ?? []).map((r) => ({ ...r, athlete_id: athleteId }));
  const psr = data?.psr ?? [];
  const weight = data?.weight ?? [];
  const perDay = dailyLoads(pse).get(athleteId);
  const m = loadMetrics(perDay, today);
  const avg = <T extends { date: string }>(rows: T[], v: (r: T) => number | null) =>
    days.map((d) => {
      const vals = rows.filter((r) => r.date === d).map(v).filter((x): x is number => x !== null);
      return vals.length ? mean(vals) : null;
    });

  const entries: Entry[] = [
    ...pse.filter((r) => r.date >= from).map((r) => ({
      kind: 'pse' as Kind,
      id: r.id!,
      date: r.date,
      at: r.created_at,
      title: r.did_not_train ? 'PSE • Não treinei' : `PSE • ${r.training_type ?? 'Treino'}`,
      detail: r.did_not_train
        ? r.observations ?? ''
        : [r.duration_minutes ? `${r.duration_minutes} min` : '', sessionLoad(r) ? `${formatUA(sessionLoad(r)!)} UA` : '', r.observations ?? ''].filter(Boolean).join(' • '),
      badge: r.did_not_train ? '—' : String(r.rpe_score),
    })),
    ...psr.filter((r) => r.date >= from).map((r) => ({
      kind: 'psr' as Kind,
      id: r.id!,
      date: r.date,
      at: r.created_at,
      title: 'PSR • Bem-estar',
      detail: `Fadiga ${r.fatigue_score} • Sono ${r.sleep_score} • Dor ${r.muscle_soreness_score} • Estresse ${r.stress_score} • Humor ${r.mood_score}`,
      badge: String(r.psr_score),
    })),
    ...weight.filter((r) => r.date >= from).map((r) => ({
      kind: 'peso' as Kind,
      id: r.id!,
      date: r.date,
      at: r.created_at,
      title: 'Peso',
      detail: '',
      badge: formatKg(r.weight),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? '').localeCompare(a.at ?? ''));

  const byDate = entries.reduce<Record<string, Entry[]>>((acc, e) => ((acc[e.date] ??= []).push(e), acc), {});

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteAthleteRecord(token, confirm.entry.kind, confirm.entry.id);
      const { correct, entry } = confirm;
      setConfirm(null);
      if (correct) onCorrect(entry.kind);
      else load();
    } catch (err: any) {
      setError(err.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const icon = (k: Kind) =>
    k === 'pse' ? <Flame className="w-4 h-4 text-orange-400" /> : k === 'psr' ? <HeartPulse className="w-4 h-4 text-emerald-400" /> : <Scale className="w-4 h-4 text-sky-400" />;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
          <History className="w-5 h-5 text-sky-400" /> Meu histórico
        </div>
        <div className="flex gap-1.5 ml-auto">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                range === r ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {r} dias
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Box title="Carga 7 dias" value={`${formatUA(m.acute)} UA`} hint="PSE × minutos" />
            <Box
              title="Último peso"
              value={weight.length ? formatKg(weight[weight.length - 1].weight) : '—'}
              hint={weight.length ? brDate(weight[weight.length - 1].date) : 'sem pesagens'}
            />
          </div>

          <DailyStatsChart
            title="PSE e PSR"
            subtitle="Média do dia (1–10)"
            dates={days}
            lines={[
              { key: 'pse', label: 'PSE', color: '#d95926', shape: 'circle', values: avg(pse, (r) => (r.did_not_train ? null : r.rpe_score)) },
              { key: 'psr', label: 'PSR', color: '#199e70', shape: 'diamond', values: avg(psr, (r) => r.psr_score) },
            ]}
          />
          <DailyStatsChart
            title="Carga diária"
            subtitle="UA (PSE × minutos)"
            dates={days}
            scale="auto"
            unit="UA"
            lines={[{ key: 'c', label: 'Carga', color: '#3987e5', shape: 'circle', values: days.map((d) => perDay?.get(d) ?? null) }]}
          />
          {weight.length > 0 && (
            <DailyStatsChart
              title="Peso"
              subtitle="kg"
              dates={days}
              scale="auto"
              unit="kg"
              lines={[{ key: 'w', label: 'Peso', color: '#3987e5', shape: 'circle', values: avg(weight, (r) => r.weight) }]}
            />
          )}

          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Minhas respostas</h3>
              <p className="text-xs text-slate-500">Enviou algo errado hoje? Toque em Corrigir: a resposta é apagada e o formulário abre para enviar de novo.</p>
            </header>
            {entries.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma resposta neste período.</p>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {Object.entries(byDate).map(([date, list]) => (
                  <div key={date} className="px-4 py-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {date === today ? 'Hoje' : new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </p>
                    {list.map((e) => (
                      <div key={e.kind + e.id} className="flex items-start gap-3">
                        <span className="mt-0.5">{icon(e.kind)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white flex flex-wrap items-center gap-x-1.5">
                            {e.title.includes('Não treinei') && <Ban className="w-3.5 h-3.5 text-amber-400" />}
                            {e.title}
                            <span className="text-[11px] font-normal text-slate-500">{localTime(e.at)}</span>
                          </p>
                          {e.detail && <p className="text-xs text-slate-400 break-words">{e.detail}</p>}
                          {date === today && (
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              <button
                                type="button"
                                onClick={() => setConfirm({ entry: e, correct: true })}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-bold"
                              >
                                <Pencil className="w-3 h-3" /> Corrigir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirm({ entry: e, correct: false })}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold"
                              >
                                <Trash2 className="w-3 h-3" /> Apagar
                              </button>
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-black text-white bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 flex-shrink-0">{e.badge}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <button type="button" onClick={() => setShowTerms(true)} className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 py-2">
        <ShieldCheck className="w-3.5 h-3.5" /> Termo de uso dos dados
      </button>
      {showTerms && <TermsModal clubName={clubName} acceptedAt={termsAcceptedAt} onClose={() => setShowTerms(false)} />}

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setConfirm(null)}>
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">{confirm.correct ? 'Corrigir resposta?' : 'Apagar resposta?'}</h3>
            <p className="text-sm text-slate-300">
              <strong className="text-white">{confirm.entry.title}</strong> enviada às {localTime(confirm.entry.at)} será apagada.
              {confirm.correct ? ' Em seguida o formulário abre para você enviar a resposta certa.' : ' Lembre de responder de novo se precisar.'}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirm.correct ? 'Apagar e corrigir' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Box: React.FC<{ title: string; value: string; hint: string }> = ({ title, value, hint }) => (
  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 min-w-0">
    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{title}</p>
    <p className="text-lg font-black text-white mt-0.5 truncate">{value}</p>
    <p className="text-[11px] text-slate-500 truncate">{hint}</p>
  </div>
);
