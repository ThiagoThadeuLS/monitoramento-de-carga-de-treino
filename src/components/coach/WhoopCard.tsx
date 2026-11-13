import React, { useEffect, useState } from 'react';
import { AlertCircle, HeartPulse, Loader2, RefreshCw } from 'lucide-react';
import { useDialogs } from '../ui/Dialogs';
import { brDate } from '../../lib/export';
import { addDaysISO, brDateOfStamp, todayISO } from '../../lib/date';
import { coachWhoop, listWhoopAthletes, recoveryTone, syncWhoop, whoopNumber, type WhoopDay, type WhoopStatus } from '../../lib/whoop';
import { DailyStatsChart } from './DailyStatsChart';

/**
 * WHOOP na ficha do atleta (comissão técnica): recuperação, HRV, FC de repouso,
 * sono e strain dos últimos dias. Só leitura — quem conecta é o atleta.
 */
export const WhoopCard: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { notify } = useDialogs();
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    coachWhoop(athleteId)
      .then((data) => !cancelled && setStatus(data))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const sync = async () => {
    setSyncing(true);
    setError('');
    try {
      await syncWhoop(athleteId);
      setStatus(await coachWhoop(athleteId));
      // A lista "WHOOP" do Elenco mostra o último dia: busca de novo na próxima vez
      listWhoopAthletes(true).catch(() => undefined);
      notify('WHOOP atualizado.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const all = status?.days ?? [];
  const days = all.slice(0, 7);
  const last = all[0] ?? null;

  // Gráficos: os últimos 30 dias, do mais antigo para o mais novo (dia sem leitura = vazio)
  const chartDates = Array.from({ length: 30 }, (_, k) => addDaysISO(todayISO(), -(29 - k)));
  const byDate = new Map(all.map((d) => [d.date, d]));
  const seriesOf = (pick: (d: WhoopDay) => unknown) => chartDates.map((date) => (byDate.has(date) ? n(pick(byDate.get(date)!)) : null));

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-rose-400" />
        <h3 className="text-sm font-bold text-white flex-1">WHOOP</h3>
        {status?.connected && (
          <>
            <span className="hidden sm:block text-[10px] text-slate-500 mr-1">
              {status.last_sync_at ? `última leitura em ${brDateOfStamp(status.last_sync_at)}` : 'sem leitura ainda'}
            </span>
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sincronizar
            </button>
          </>
        )}
      </header>

      <div className="p-4">
        {loading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : !status?.connected ? (
          <p className="text-[12px] text-slate-400 leading-relaxed">
            Este atleta ainda não conectou o WHOOP. Peça para ele abrir <strong className="text-slate-200">Perfil → WHOOP</strong>{' '}
            no app e conectar a conta da pulseira; os dados aparecem aqui depois disso.
          </p>
        ) : days.length === 0 ? (
          <p className="text-[12px] text-slate-400">
            Conta conectada{status.whoop_name ? ` (${status.whoop_name})` : ''}, mas nenhum dia importado ainda. Sincronize
            depois da primeira noite com a pulseira.
          </p>
        ) : (
          <div className="space-y-4">
          {/* Último dia lido */}
          {last && (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">
                Último dia: {brDate(last.date)}
                {status.whoop_name ? ` • conta ${status.whoop_name}` : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Tile label="Recuperação" value={num(n(last.recovery_score), '%')} tone={recoveryTone(n(last.recovery_score))} />
                <Tile label="HRV" value={num(n(last.hrv_ms), ' ms', 0)} />
                <Tile label="FC repouso" value={num(n(last.resting_hr), ' bpm', 0)} />
                <Tile
                  label="Sono"
                  value={num(n(last.sleep_hours), ' h', 1)}
                  hint={n(last.sleep_performance) !== null ? `${num(n(last.sleep_performance), '%')} do necessário` : undefined}
                />
                <Tile label="Strain" value={num(n(last.strain), '', 1)} hint={n(last.day_kj) !== null ? `${num(n(last.day_kj), ' kJ')}` : undefined} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DailyStatsChart
              title="Recuperação WHOOP"
              subtitle="% • últimos 30 dias"
              dates={chartDates}
              scale="auto"
              unit="%"
              references={[
                { value: 67, label: '67', color: '#34d399' },
                { value: 34, label: '34', color: '#f87171' },
              ]}
              lines={[{ key: 'rec', label: 'Recuperação', color: '#fb7185', shape: 'circle', values: seriesOf((d) => d.recovery_score) }]}
            />
            <DailyStatsChart
              title="HRV e FC de repouso"
              subtitle="ms e bpm • últimos 30 dias"
              dates={chartDates}
              scale="auto"
              lines={[
                { key: 'hrv', label: 'HRV (ms)', color: '#38bdf8', shape: 'circle', values: seriesOf((d) => d.hrv_ms) },
                { key: 'fc', label: 'FC repouso (bpm)', color: '#a78bfa', shape: 'square', values: seriesOf((d) => d.resting_hr) },
              ]}
            />
            <DailyStatsChart
              title="Sono"
              subtitle="horas por noite • últimos 30 dias"
              dates={chartDates}
              scale="auto"
              unit="h"
              lines={[{ key: 'sono', label: 'Sono', color: '#818cf8', shape: 'circle', values: seriesOf((d) => d.sleep_hours) }]}
            />
            <DailyStatsChart
              title="Strain do dia"
              subtitle="0 a 21 • últimos 30 dias"
              dates={chartDates}
              scale="auto"
              lines={[{ key: 'strain', label: 'Strain', color: '#f59e0b', shape: 'square', values: seriesOf((d) => d.strain) }]}
            />
          </div>

          <div className="overflow-x-auto -mx-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1 px-1">Últimos 7 dias</p>
            <table className="w-full text-[11px] min-w-[520px]">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left font-bold px-2 py-1.5">Dia</th>
                  <th className="text-right font-bold px-2 py-1.5">Recup.</th>
                  <th className="text-right font-bold px-2 py-1.5">HRV</th>
                  <th className="text-right font-bold px-2 py-1.5">FC repouso</th>
                  <th className="text-right font-bold px-2 py-1.5">Sono</th>
                  <th className="text-right font-bold px-2 py-1.5">Strain</th>
                  <th className="text-right font-bold px-2 py-1.5">Passos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {days.map((d) => (
                  <Row key={d.date} day={d} />
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {status?.last_error && status.connected && (
          <p className="mt-2 text-[11px] text-amber-300/90">
            A última sincronização falhou. Tente de novo; se continuar, peça ao atleta para reconectar.
          </p>
        )}
      </div>
    </section>
  );
};

const n = whoopNumber;

const Row: React.FC<{ day: WhoopDay }> = ({ day }) => {
  const rec = n(day.recovery_score);
  const tone = rec === null ? 'text-slate-500' : rec >= 67 ? 'text-emerald-300' : rec >= 34 ? 'text-amber-300' : 'text-rose-300';
  return (
    <tr>
      <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{brDate(day.date).slice(0, 5)}</td>
      <td className={`px-2 py-2 text-right font-black ${tone}`}>{num(rec, '%')}</td>
      <td className="px-2 py-2 text-right text-slate-200">{num(n(day.hrv_ms), ' ms', 0)}</td>
      <td className="px-2 py-2 text-right text-slate-200">{num(n(day.resting_hr), ' bpm', 0)}</td>
      <td className="px-2 py-2 text-right text-slate-200">{num(n(day.sleep_hours), ' h', 1)}</td>
      <td className="px-2 py-2 text-right text-slate-200">{num(n(day.strain), '', 1)}</td>
      <td className="px-2 py-2 text-right text-slate-400">{n(day.steps)?.toLocaleString('pt-BR') ?? '—'}</td>
    </tr>
  );
};

const num = (value: number | null, suffix = '', digits = 0) =>
  value === null ? '—' : `${value.toFixed(digits).replace('.', ',')}${suffix}`;

const Tile: React.FC<{ label: string; value: string; tone?: string; hint?: string }> = ({ label, value, tone = 'text-white', hint }) => (
  <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p className={`text-lg font-black leading-tight ${tone}`}>{value}</p>
    {hint && <p className="text-[10px] text-slate-500 truncate">{hint}</p>}
  </div>
);
